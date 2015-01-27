var extend = require('util')._extend;

module.exports = function(sandbox, options) {
    options = extend({}, options);

    return {
        onStart : function(done){
            sandbox.process.exec('require', [__dirname + '/transaction-vm.js'], done);
        },
        exec : function(transaction, callback) {
            sandbox.exec('transaction', [transaction.assets.script.code, transaction.assets.script.input], function(err, result){
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