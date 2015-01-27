module.exports = function(done, scope) {
    scope.contextRequire = function(done, name, module) {
        scope.vm.context[name] = require(module);
        done();
    };

    done();
};
