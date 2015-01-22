var extend = require('util')._extend;

module.exports = function (sandbox, options) {

    options = extend({
        limit : 1000
    }, options);

    return {
        time : null,
        timeout : null,
        onStart : function(done) {
            this.time = Date.now();

            done();
        },
        onReady : function(done){
            this.timeout = setTimeout(function(){
                sandbox.error(new Error('Timeout: ' + options.limit))
            }, options.limit);

            done();
        },
        onStop : function(done) {
            if (sandbox._options.verbose) console.log('Done in %d ms', (Date.now() - this.time)/1000);


            this.time = null;
            clearTimeout(this.timeout);
            this.timeout = null;

            done();
        },
        onError : function(){
            this.time = null;
            clearTimeout(this.timeout);
            this.timeout = null;
        }
    };
};
