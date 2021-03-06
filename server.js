"use strict";

var _ = require('underscore'),
    fs = require('fs'),
    Express = require('express'),
    BodyParser = require('body-parser'),
    ExpressHandlebars = require('express3-handlebars'),
    ExpressSession = require('express-session'),
    LessMiddleware = require('less-middleware'),
    Busboy = require('connect-busboy'),
    xml2js = require('xml2js'),
    libxmljs = require('libxmljs'),
    uuid = require('node-uuid'),
    Diagram = require('./diagram.js');

// {{{ Express setup
var app = new Express();

app.engine('handlebars', ExpressHandlebars({defaultLayout: 'main'}));

app.use(LessMiddleware(__dirname + '/style', {dest: __dirname + '/public'}));
app.use(Express.static(__dirname + '/public'));

app.set('view engine', 'handlebars');
app.use(Busboy());
//app.use(BodyParser.urlencoded());

app.use(ExpressSession({secret: 'DEV_SECRET'}));

// }}}

// {{{ App Specific Constants
var STRUCTURE_KEY          = 'Description';
var BASIC_COMMAND_CATEGORY = '$Base';
var CUSTOM_CATEGORY        = 'VANL';
var TTS_TYPE               = 'Say';
var SILENT_TTS             = '$SILENT';
var BASE_PROFILE           = __dirname + '/public/BASE_PROFILE.vap';
var COMPILED_PROFILE       = __dirname + '/public/COMPILED_PROFILE.vap';

// }}}

app.get('/', function(req, res) {
    res.render('home');
});

app.post('/edit', function(req, res) {
    req.pipe(req.busboy);

    req.busboy.on('file', function(fieldname, file, filename) {
        var val = "";
        file.on('data', function(data) {
            val = val + data;
        });
        file.on('end', function() {
            xml2js.parseString(val, function(err, result) {
                var basic_commands = {};
                result.Profile.Commands[0].Command =_.filter(
                    result.Profile.Commands[0].Command,
                    function(command, i) {
                        var keep = true;

                        if (command.Category) {
                            if (command.Category[0].indexOf( BASIC_COMMAND_CATEGORY) === 0) {
                                basic_commands[command.Id[0]] = command;
                            } else if (command.Category[0] === CUSTOM_CATEGORY) {
                                keep = false;
                            }
                        }

                        return keep;
                    }
                );

                req.session.result = result;
                req.session.basic_commands = basic_commands;

                res.render('form', {
                    basic_commands: _.map(basic_commands, function(command) {
                        var tts = [];
                        command.ActionSequence.every(function(action) {
                            return action.CommandAction.every(function(a) {
                                if (a.ActionType[0] === TTS_TYPE) {
                                    tts = a.Context[0].split(";");
                                    return false;
                                }
                                return true;
                            });
                        });

                        var mapped_tts = {};
                        _.each(tts, function(phrase) {
                            if (phrase) {
                                if (mapped_tts[phrase]) {
                                    mapped_tts[phrase] = mapped_tts[phrase] + 1;
                                } else {
                                    mapped_tts[phrase] = 1;
                                }
                            }
                        });

                        var tts_arr = [];
                        _.each(mapped_tts, function(value, key) {
                            if (key === ' ') {
                                key = SILENT_TTS;
                            }
                            tts_arr.push({phrase: key, percent: (value/100)});
                        });

                        var structures = command[STRUCTURE_KEY] ? JSON.parse(command[STRUCTURE_KEY][0]) : [];

                        return {
                            id: command.Id[0],
                            command_string: command.CommandString[0],
                            structures: structures,
                            multiple_structures: structures.length > 1,
                            tts: tts_arr,
                            multiple_tts: tts_arr.length > 1
                        };
                    })
                });
            });
        });
    });
});

app.post('/submit', function(req, res) {
    req.pipe(req.busboy);

    var inputs = {};
    req.busboy.on('field', function(fieldname, val) {
        var field_parts = fieldname.split('_');
        var field_id = field_parts[0];
        var field_key = field_parts[1];
        var field_index = field_parts[2];

        if (!inputs[field_id]) {
            inputs[field_id] = {};
            inputs[field_id].tts = {};
            inputs[field_id].structures = [];
        }

        if (!inputs[field_id].tts[field_index]) {
            inputs[field_id].tts[field_index] = {};
        }

        if (field_key === 'structure') {
            inputs[field_id].structures.push(val);
        } else if (field_key === 'tts') {
            val = val.trim();
            if (val === SILENT_TTS) {
                inputs[field_id].tts[field_index].phrase = ' ';
            } else if (val !== "") {
                inputs[field_id].tts[field_index].phrase = val;
            }
        } else if (field_key === 'ttspercent') {
            inputs[field_id].tts[field_index].percent = val;
        } else {
            inputs[field_id][field_key] = val;
        }
    });

    req.busboy.on('finish', function() {
        var xml = req.session.result;
        var basic_commands = req.session.basic_commands;

        // {{{ generate_command
        var generate_command = function(id, command_string) {
            return {
                Id: [uuid.v4()],
                CommandString: [command_string],
                ActionSequence: [{
                    CommandAction: [{
                        Id: [uuid.v4()],
                        ActionType: ['ExecuteCommand'],
                        Duration: ['0'],
                        Delay: ['0'],
                        KeyCodes: [''],
                        Context: [id],
                        X: ['1'],
                        Y: ['0'],
                        InputMode: ['0']
                    }]
                }],
                Category: [CUSTOM_CATEGORY]
//                Async: ['true'],
//                Enabled: ['true'],
//                UseShortcut: ['false'],
//                keyValue: ['0'],
//                keyShift: ['0'],
//                keyAlt: ['0'],
//                keyCtrl: ['0'],
//                keyWin: ['0'],
//                keyPassthru: ['true'],
//                UseSpokenPhrase: ['true'],
//                onlyKeyUp: ['false'],
//                RepeatNumber: ['2'],
//                RepeatType: ['0'],
//                CommandType: ['0'],
//                SourceProfile: ['00000000-0000-0000-0000-000000000000'],
//                Referrer: [{'$': {'xsi:nil': 'true'}}]
            };
        };

        // }}}

        var variations = null,
            num_commands = 0,
            generator = new Diagram();
        _.each(inputs, function(input, key) {
            var base_command = basic_commands[key];
            var serialized_structure = JSON.stringify(input.structures);
            var joined_tts = null;
            if (input.tts && _.keys(input.tts).length > 0) {
                joined_tts = _.reduce(input.tts, function(memo, value) {
                    var percent = parseFloat(value.percent) + 0.01;
                    if (!percent || isNaN(percent)) {
                        percent = 0.01;
                    }
                    if (value.phrase) {
                        return  memo + (new Array(Math.floor(percent*100))).join(value.phrase + ';');
                    } else {
                        return memo;
                    }
                }, "");
            }
            _.each(xml.Profile.Commands[0].Command, function(command) {
                if (command.Id && command.Id[0] === key) {
                    command[STRUCTURE_KEY] = serialized_structure;

                    if (joined_tts) {
                        // Find the first tts command
                        command.ActionSequence.every(function(action) {
                            return action.CommandAction.every(function(a) {
                                if (a.ActionType[0] === TTS_TYPE) {
                                    a.Context[0] = joined_tts;
                                    return false;
                                }
                                return true;
                            });
                        });
                    }
                }
            });
        });

        // Build original profile first
        var builder = new xml2js.Builder();

        fs.writeFile(BASE_PROFILE, builder.buildObject(xml), function(err) {
            console.log('Saved base profile with sentence structures');

            _.each(inputs, function(input, key) {
                var base_command = basic_commands[key];
                var all_variations = [];
                _.each(input.structures, function(structure) {
                    var prev_length = all_variations.length;
                    all_variations = all_variations.concat(generator.generate(structure));
                    console.log("Finished " + (all_variations.length - prev_length) + " variations for: " + structure);
                });

                xml.Profile.Commands[0].Command.push(
                    generate_command(key, all_variations.join(";"))
                );
            });

            console.log("Getting ready to build compiled profile...");

            fs.writeFile(COMPILED_PROFILE, builder.buildObject(xml), function(err) {
                console.log('Built profile with ' + num_commands + ' commands');
                res.render('result');
            });
        });
    });
});

app.get('/result', function(req, res) {
    res.render('result');
});

app.get('/download/base_profile', function(req, res) {
    res.download(BASE_PROFILE);
});

app.get('/download/compiled_profile', function(req, res) {
    res.download(COMPILED_PROFILE);
});

app.get('/test', function(req, res) {
    var test_string = "(balance [the [(fucking, god damn)]] power, even [out the [(fucking, god damn)]] power [distribution])";
    res.render('test', {
        result: '',
        variations: (new Diagram()).generate(test_string)
    });
});

var port = 3001;
app.listen(port);
console.log("Started server on port " + port);
