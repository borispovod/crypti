module.exports = Field;

/**
 *
 * @param {Validator} validator Validator instance
 * @param {string} path Validation field path
 * @param {*} value Validated value
 * @param {object} rules Set of rules
 * @param {*} thisArg Value used as this reference within rule callback calls.
 * @constructor
 */
function Field(validator, path, value, rules, thisArg) {
    this.isAsync = false;
    this.hasError = false;
    this.rules = rules;
    this.value = value;
    this.report = [];
    this.path = path||[];
    this.thisArg = thisArg||null;
    this._stack = Object.keys(rules);
    this.validator = validator;
}

/**
 * Create child field.
 * @param {string} path Validation field path
 * @param {*} value Validated value
 * @param {object} rules Set of rules
 * @param {*} thisArg Value used as this reference within rule callback calls.
 * @returns {Validator.Field}
 */
Field.prototype.child = function (path, value, rules, thisArg) {
    var field = this.validator.createField(this.path.concat(path), value, rules, thisArg);
    field.report = this.report;
    return field;
};

/**
 * Validate field value and trigger callback on result
 * @param callback
 */
Field.prototype.validate = function(callback) {
    var stack = this._stack;
    // TODO copy value
    var value = this.value;
    var report = this.report;
    var descriptor, result, accept;
    var thisArg = this.thisArg;

    this.callback = callback;

    if (! stack.length) return;

    while (stack.length) {
        var rule = stack.shift();

        accept = this.rules[rule];

        try {
            if (typeof accept === 'function') {
                accept = accept.call(thisArg, value);
            }

            if (! this.validator.hasRule(rule) && ! this.validator.skipMissed) {
                throw new Error('Rule "' + rule + '" not found for "' + this.path.join('.') + '".');
            }

            descriptor = this.validator.getRule(rule);

            if (descriptor.filter) {
                value = this.value = descriptor.filter.call(thisArg, accept, value, this);
            }

            if (descriptor.validate) {
                result = descriptor.validate.call(thisArg, accept, value, this);
            }

            if (this.isAsync) return;

            if (result === false) {
                report.push({
                    path : this.path,
                    rule : rule,
                    accept : accept
                });

                this.hasError = true;
                stack.length = 0;
            }
        } catch (err) {
            err.field = this;
            this.validator.onError(this, err);

            this.end(err, report, value);
            return;
        }
    }

    if (! stack.length) {
        this.end(null, report, value);
    }
};

/**
 * End validation. Drop validation stack.
 * @param {Error} err Report and error if passed. Optional
 */
Field.prototype.end = function(err) {
    this._stack = [];

    if (this.hasError) {
        this.validator.onInvalid(this);
    } else {
        this.validator.onValid(this);
    }

    this.callback(err, this.report, this.value);
};

/**
 * Create validation async. Callback get done function to emit validation end.
 * @param {function(done:function)} callback
 */
Field.prototype.async = function(callback) {
    this.isAsync = true;
    var self = this;
    callback(function(err){
        if (arguments.length > 1) {
            self.value = arguments[1];
        }

        self.isAsync = false;

        if (err) {
            if (! err.field) {
                err.field = self;
                self.validator.onError(self, err);
            }
            self.end(err);
        } else {
            self.validate(self.callback);
        }
    });
};

/**
 * Report an invalid validation result
 * @param {{}} report Validation report object
 */
Field.prototype.report = function(report){
    this.hasError = true;
    report.path = this.path.concat(path);
    this.report.push(report);
};
