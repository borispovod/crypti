module.exports = function(done, scope, options) {

    scope.transaction = function(done, script, params, input) {
        var call = this.vm._eval(script.source, script.filename);

        if (typeof call !== 'function') {
            return done(new Error("Transaction code should be a function"));
        }

        try {
            call(done, input, params);
        } catch (err) {
            done(err);
        }
    };

    done();
};
