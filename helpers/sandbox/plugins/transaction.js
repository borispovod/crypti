var extend = require('util')._extend;

module.exports = function(sandbox, options) {
    options = extend({}, options);

    return {
        require : 'process',
        onStart : function(done){
            sandbox.process.exec('require', [__dirname + '/transaction-vm.js'], done);
        },
        exec : function(transaction, callback) {
            var script = {
                filename : 'transaction#' + transaction.id,
                source : transaction.assets.script.code
            };

            var input = transaction.assets.script.input;

            sandbox.exec('transaction', [script, input], function(err, result){
                // Bind session object
                callback = callback.bind(this);

                if (err) return callback(err);

                if (typeof result !== 'string') {
                    return callback(new Error("Script result type mismatch"));
                }

                if (result !== 'TRUE' && result !== 'FALSE') {
                    return callback(new Error("Script result value mismatch"))
                }

                callback(null, result);
            });
        }
    };
};