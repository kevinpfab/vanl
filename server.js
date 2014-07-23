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
var STRUCTURE_KEY     = 'VANLStructure';
var BASIC_COMMAND_KEY = '$BASIC';

// }}}

app.get('/', function(req, res) {
    res.render('home');
});

app.post('/edit', function(req, res) {
    var fstream;
    req.pipe(req.busboy);
    req.busboy.on('field', function(fieldname, val, fieldnameTruncated, valTruncated) {
        xml2js.parseString(val, function(err, result) {

            var basic_commands = {};
            _.each(result.Profile.Commands[0].Command, function(command) {
                if (command.Category && command.Category[0] === BASIC_COMMAND_KEY) {
                    basic_commands[command.Id[0]] = command;
                }
            });

            req.session.result = result;
            req.session.basic_commands = basic_commands;

            res.render('form', {
                basic_commands: _.map(basic_commands, function(command) {
                    return {
                        id: command.Id[0],
                        command_string: command.CommandString[0],
                        structure: command[STRUCTURE_KEY] ? command[STRUCTURE_KEY][0] : null
                    };
                })
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

        if (!inputs[field_id]) {
            inputs[field_id] = {};
        }
        inputs[field_id][field_key] = val;
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
                Async: ['true'],
                Enabled: ['true'],
                UseShortcut: ['false'],
                keyValue: ['0'],
                keyShift: ['0'],
                keyAlt: ['0'],
                keyCtrl: ['0'],
                keyWin: ['0'],
                keyPassthru: ['true'],
                UseSpokenPhrase: ['true'],
                onlyKeyUp: ['false'],
                RepeatNumber: ['2'],
                RepeatType: ['0'],
                CommandType: ['0'],
                SourceProfile: ['00000000-0000-0000-0000-000000000000'],
                Referrer: [{'$': {'xsi:nil': 'true'}}]
            };
        };

        // }}}

        var generator = new Diagram();
        var variations;
        _.each(inputs, function(input, key) {
            var base_command = basic_commands[key];
            var structure = input.structure;
            variations = generator.generate(structure);
            console.log(structure);

            _.each(xml.Profile.Commands[0].Command, function(command) {
                if (command.Id && command.Id[0] === key) {
                    command[STRUCTURE_KEY] = [structure];
                }
            });

            _.each(variations, function(sentence) {
                if (sentence !== base_command.CommandString[0]) {
                    xml.Profile.Commands[0].Command.push(
                        generate_command(key, sentence)
                    );
                }
            });
        });

        var builder = new xml2js.Builder();
        res.render('result', {
            result: builder.buildObject(xml),
            variations: variations
        });
    });
});

app.get('/test', function(req, res) {
    var test_string = "[Amy] [(engage,turn on,deploy,raise,bring)] Shields [(up,on,online)] [please] [(some,more [crazy],[(text,again)] with)] (maybe,yes,no)";
    res.render('result', {
        result: '',
        variations: (new Diagram()).generate(test_string)
    });
});

var port = 3001;
app.listen(port);
console.log("Started server on port " + port);
