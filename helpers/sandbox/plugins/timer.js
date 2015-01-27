var extend = require('util')._extend;

module.exports = function (sandbox, options) {

    options = extend({
        limit : 1000
    }, options);

    return {
        time : null,
        timeout : null,
        onStart : function() {
            this.time = Date.now();
        },
        onBeforeExec : function(){
            this.setTimeout(function(){
                sandbox.error(new Error('Timeout: ' + options.limit))
            }, options.limit);
        },
        onStop : function() {
            var time = Date.now() - this.time;
            this.session.timer = time;

            this.time = null;
            this.clearTimers();
        }
    };
};
