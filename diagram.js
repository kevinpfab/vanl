var Diagram = function() {

    var self = {};

    // {{{ parse
    self.parse = function(str) {
        this._original = str;
        return this._parse(this._original);
    };

    // }}}
    // {{{ generate
    self.generate = function(str) {
        var parsed = this.parse(str);
        return this._generate(parsed);
    };

    // }}}

    // Private
    // {{{ Matching Wrappers
    var OPTIONAL_OPEN  = '[';
    var OPTIONAL_CLOSE = ']';
    var CHOICE_OPEN    = '(';
    var CHOICE_CLOSE   = ')';
    var MATCHING_WRAPPER = {
        '[': ']',
        ']': '[',
        '(': ')',
        ')': '('
    };

    // }}}

    // {{{ _parse
    self._parse = function(str) {
        var tokens = [];
        var token = "";
        var i = 0;

        var push_string = function(s) {
            if (s) {
                tokens.push({type: 'string', value: s});
                token = "";
            }
        };

        while (i < str.length) {
            var c = str[i];
            var exit, contents = null;
            var remaining = str.substring(i+1, str.length);

            if (c === OPTIONAL_OPEN) {
                push_string(token);

                exit = this._find_optional_exit(remaining);
                contents = str.substring(i+1, i+exit+1);

                tokens.push({
                    type: 'optional',
                    value: this._parse(contents)
                });

                i += exit;
            } else if (c === CHOICE_OPEN) {
                push_string(token);

                exit = this._find_choice_exit(remaining);
                contents = str.substring(i+1, i+exit+1);

                var choices = contents.split(',');
                tokens.push({
                    type: 'choice',
                    value: choices.map(this._parse.bind(this))
                });

                i += exit;
            } else if (c !== OPTIONAL_CLOSE && c !== CHOICE_CLOSE) {
                token += c;
            }

            i += 1;
        }

        push_string(token);

        return tokens;
    };

    // }}}
    // {{{ _find_optional_exit
    self._find_optional_exit  = function(str) {
        return this._find_exit_character(str, OPTIONAL_CLOSE);
    };

    // }}}
    // {{{ _find_choice_exit
    self._find_choice_exit  = function(str) {
        return this._find_exit_character(str, CHOICE_CLOSE);
    };

    // }}}
    // {{{ _find_exit_character
    self._find_exit_character = function(str, close) {
        var c = 0,
            i = 0;

        for (i=0; i<str.length; i+=1) {
            if (str[i] === close) {
                if (c === 0) {
                    return i;
                } else {
                    c -= 1;
                }
            } else if (str[i] === MATCHING_WRAPPER[close]) {
                c += 1;
            }
        };

        return -1;
    };

    // }}}

    // {{{ _generate
    self._generate = function(root_node) {
        var sentences = [];
        var finished = false;
        var num_variations = this._number_of_varations(root_node);
        console.log(num_variations);

        var i = 0;
        for (i=0; i<num_variations; i+=1) {
            sentences[i] = "";
        }

        sentences = this._add_node(root_node, sentences);

        return sentences.filter(function(elem, i) {
            return sentences.indexOf(elem) === i;
        });
    };

    // }}}
    // {{{ _add_node
    self._add_node = function(node, current_sentences) {
        var to_s = Object.prototype.toString.call(node);
        if (to_s == '[object Array]') {
            var i = 0;
            for (i=0; i<node.length; i+=1) {
                current_sentences = this._add_node(node[i], current_sentences);
            }
        } else if (to_s == '[object String]') {
            current_sentences = this._add_string(node, current_sentences);
        } else if (node.type === 'string') {
            current_sentences = this._add_string(node.value, current_sentences);
        } else if (node.type === 'optional') {
            current_sentences = this._add_optional(node, current_sentences);
        } else if (node.type === 'choice') {
            current_sentences = this._add_choice(node, current_sentences);
        }

        return current_sentences;
    };

    // }}}
    // {{{ _add_string
    self._add_string = function(str, current_sentences) {
        var i = 0;
        for (i=0; i<current_sentences.length; i+=1) {
            current_sentences[i] = current_sentences[i] + str;
        }
        return current_sentences;
    };

    // }}}
    // {{{ _add_optional
    self._add_optional = function(p, current_sentences) {
        var half = current_sentences.length / 2;
        var set1 = current_sentences.slice(0, half);
        var set2 = current_sentences.slice(half, current_sentences.length);

        set1 = this._add_node(p.value, set1);
        set2 = this._add_string("", set2);

        var i = 0;
        for (i=0; i<current_sentences.length; i+=2) {
            current_sentences[i]   = set1[i/2];
            current_sentences[i+1] = set2[i/2];
        }

        return current_sentences;
    };

    // }}}
    // {{{ _add_choice
    self._add_choice = function(p, current_sentences) {
        var num_choices = p.value.length;
        var split = current_sentences.length / num_choices;
        var sets = [];

        var i = 0;
        for (i=0; i<num_choices; i+=1) {
            sets[i] = current_sentences.slice(split*i, split*(i+1));
            sets[i] = this._add_node(p.value[i], sets[i]);
        }

        var j = 0;
        for (i=0; i<split; i+=(num_choices)) {
            for (j=0; j<num_choices; j+=1) {
                current_sentences[i+j] = sets[j][i];
            }
        }

        return current_sentences;
    };

    // }}}
    // {{{ _number_of_varations
    self._number_of_varations = function(parsed) {
        var num_varations = 1;
        var i = 0;
        for (i=0; i<parsed.length; i+=1) {
            var item = parsed[i];
            if (item.type === 'optional') {
                num_varations = num_varations * 2 * this._number_of_varations(item.value);
            } else if (item.type === 'choice') {
                var j;
                for (j=0;j<item.value.length;j+=1) {
                    num_varations = num_varations * this._number_of_varations(item.value[j]);
                }
                num_varations = num_varations * item.value.length;
            }
        }

        return num_varations;
    };

    // }}}

    return self;
};

module.exports = Diagram;
