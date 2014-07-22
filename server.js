"use strict";

var _ = require('underscore'),
    Express = require('express'),
    BodyParser = require('body-parser'),
    ExpressHandlebars = require('express3-handlebars'),
    LessMiddleware = require('less-middleware'),
    xml2js = require('xml2js'),
    libxmljs = require('libxmljs'),
    uuid = require('node-uuid'),
    Diagram = require('./diagram.js');

var app = new Express();

app.engine('handlebars', ExpressHandlebars({defaultLayout: 'main'}));

app.use(LessMiddleware(__dirname + '/style', {dest: __dirname + '/public'}));
app.use(Express.static(__dirname + '/public'));

app.set('view engine', 'handlebars');
app.use(BodyParser.urlencoded());

app.get('/', function(req, res) {
    res.render('home');
});

app.post('/edit', function(req, res) {
    xml2js.parseString(req.body.profile, function(err, result) {
        var test_string = "[Amy] [(would you,can you)] [please] [(deploy,raise,engage,activate,bring)] shields [(up,online)] [(please,[and thank you])]";
        var command_strings = (new Diagram()).generate(test_string);

        var clone_str = JSON.stringify(result['Profile']['Commands'][0]);
        _.each(command_strings, function(str) {
            var clone = JSON.parse(clone_str);

            clone['Command'][0]['Id'][0] = uuid.v4();
            clone['Command'][0]['CommandString'][0] = str;

            result['Profile']['Commands'].push(clone);
        });

        var builder = new xml2js.Builder();

        res.render('form', {
            basic_commands: _.map(result['Profile']['Commands'], function(command) {
                var cmd = command['Command'][0];
                return {
                    CommandString: cmd['CommandString'][0]
                };
            }),
            new_stuff: builder.buildObject(result)
        });
    });
});

var port = 3001;
app.listen(port);
console.log("Started server on port " + port);
