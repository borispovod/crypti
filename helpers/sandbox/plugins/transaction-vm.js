module.exports = function(done, scope, options) {

    scope.transaction = function(done, script, input) {
        var call = this.vm._eval(script, 'transaction');

        if (typeof call !== 'function') {
            return done(new Error("Transaction code should be a function"));
        }

        try {
            call(done);
            console.log("X", script.code);
        } catch (err) {
            console.log(err);
        }
        try {
            call(done, input);
        } catch (err) {
            done(err);
        }
    };

    done();
};
