"use strict";

var _ = require('underscore'),
    Express = require('express'),
    Diagram = require('./diagram.js');

var app = new Express();

app.get('/', function(req, res) {
    var test_string = "[Amy] [(would you, can you)] [please] [(engage, raise, deploy)] shields [please] [and] [thank you]";
    test_string = "[Amy [whee]] success [goes to me] [you see]";

    var result = (new Diagram()).parse(test_string);
    var test = (new Diagram()).generate(test_string);

    res.json(200, test);
});

var port = 3001;
app.listen(port);
console.log("Started server on port " + port);
