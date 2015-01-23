// Dependencies
var should = require('should');
var fs = require('fs');

// Read file content sync
function readFile(path) {
    return fs.readFileSync(__dirname + '/' + path, 'utf-8');
}

// Test body ------------------------------------------------------------------

describe('Sandbox.', function(){

    var Sandbox;
    var sandbox;

    it('Module exports a function', function(){
        Sandbox = require('../../helpers/sandbox/sandbox.js');
        should(Sandbox).type('function', 'Sandbox is a function');
    });

    it('Instance should be an object', function(){
        sandbox = new Sandbox({
            plugins : {
                process : {
                    stdio : 'inherit'
                },
                tcp : true,
                api : {
                    transport : 'tcp'
                },
                timer : true
            }
        });
        should(sandbox).type('object', 'Its\' instance is an object');
    });

    describe('Method run().', function() {
        it('Should run code.', function(done){
            sandbox.run('done(null,true)', function(err, result){
                should(err).equal(null, 'Error should equal null');
                should(result).equal(true, 'Result is true');
                done();
            });
        });

        it('Should call setTimeout', function(done){
            sandbox.run('setTimeout(done.bind(null, null, true))', function(err, result){
                should(err).equal(null, 'No error is passed');
                should(result).equal(true, 'Result is true');
                done();
            });
        });


        it('Should reach timer limit', function(done){
            sandbox.process.options.limitTime = 100;

            sandbox.run('setTimeout(done, 1000)', function(err){
                sandbox.process.options.limitTime = 1000;
                should(err).not.equal(null, '`err` not empty');

                done();
            });
        });

        it('Should not reach CPU limit 25%', function(done){
            sandbox.run('setTimeout(done, 500);', function(err){
                should(err).equal(null, '`err` is empty');

                done();
            });
        });

        it('Should reach sandbox.cpuLimit 1%', function(done){
            sandbox.cpuLimit = 1;
            sandbox.run('setTimeout(done, 1000)', function(err){
                should(err).not.equal(null, '`err` is not null');
                sandbox.cpuLimit = 25;
                done();
            });
        });
    });

    describe('API plugin.', function(){
        it('Should create context functions', function(done){
            sandbox.api.module({
                callApi : function(done) {
                    done(null, true);
                }
            });

            sandbox.run('done(null, typeof callApi)', function(err, type){
                should(err).equal(null, '`err` is null');
                should(type).equal('function', 'callApi should be function');
                done();
            });
        });

        it('Should call api method', function(done){
            sandbox.run('callApi(done)', function(err, result){
                should(err).equal(null, '`err` is null');
                should(result).equal(true, 'Result is `true`');

                done();
            });
        });

        // TODO Implement nested API methods bindings
        //it('Should support nested api objects', function(done){
        //    sandbox.api.module({
        //        nested : {
        //            method: function (done) {
        //                done(null, true);
        //            }
        //        }
        //    });
        //
        //    sandbox.run('nested.method(done)', function(err, result){
        //        should(err).equal(null, 'There is no error');
        //        should(result).equal(true);
        //
        //        done();
        //    });
        //});
    });
});