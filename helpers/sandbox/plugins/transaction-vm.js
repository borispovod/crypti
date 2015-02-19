module.exports = function(done, scope, options) {

    scope.transaction = function(done, script, params, input) {
        var transaction = {
            SUCCESS : 'TRUE',
            FAIL : 'FALSE',
            parameters : params
        };

        transaction = this.vm._eval(script.source + '\ntransaction;', script.filename, {
            transaction : transaction
        });

        if (typeof transaction.run !== 'function') {
            return done(new Error("Transaction code should be a function"));
        }

        transaction.run(done, input);
    };

    done();
};
