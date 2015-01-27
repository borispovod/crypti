var extend = require('util')._extend;
var async = require('async');

module.exports = function(sandbox, options) {
    options = extend({}, options);

    return {
        require : 'process',
        onStart : function(done) {
            sandbox.process.exec('require', [__dirname + '/context-vm.js'], function(err){
                if (err) return done(err);

                async.map(Object.keys(options), function(key, done){
                    var moduleName = options[key];
                    var modulePath;
                    if (moduleName === true) {
                        moduleName = key;
                    }

                    // Resolve path to require
                    modulePath = require.resolve(moduleName);

                    sandbox.process.exec('contextRequire', [key,  modulePath], done);
                }, done);
            });
        }
    }
};
