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
                source : transaction.asset.script.code
            };

            var args = [
                script,
                transaction.asset.input,
                transaction.asset.script.parameters
            ];

            sandbox.exec('transaction', args, function(err, result){
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