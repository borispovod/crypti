// Dependencies
var should = require('should');

// Test body ------------------------------------------------------------------

describe('Sandbox.', function(){

    var Sandbox;
    var sandbox;

    it('Module exports a function', function(){
        Sandbox = require('../helpers/sandbox/sandbox.js');
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
                }
            }
        });
        should(sandbox).type('object', 'Its\' instance is an object');
    });

    describe('Method eval().', function() {
        it('Should run code.', function(done){
            sandbox.eval('done(null,true)', function(err, result){
                should(err).equal(null, 'Error should equal null');
                should(result).equal(true, 'Result is true');
                done();
            });
        });

        it('Should call setTimeout', function(done){
            sandbox.eval('setTimeout(done.bind(null, null, true))', function(err, result){
                should(err).equal(null, 'No error is passed');
                should(result).equal(true, 'Result is true');
                done();
            });
        });


        it('Should reach timer limit', function(done){
            sandbox.process.options.limitTime = 100;

            sandbox.eval('setTimeout(done, 1000)', function(err){
                sandbox.process.options.limitTime = 1000;
                should(err).not.equal(null, '`err` not empty');

                done();
            });
        });

        it('Should not reach CPU limit 25%', function(done){
            sandbox.eval('setTimeout(done, 500);', function(err){
                should(err).equal(null, '`err` is empty');

                done();
            });
        });

        it('Should reach sandbox.cpuLimit 1%', function(done){
            sandbox.cpuLimit = 1;
            sandbox.eval('setTimeout(done, 1000)', function(err){
                should(err).not.equal(null, '`err` is not null');
                sandbox.cpuLimit = 25;
                done();
            });
        });
    });

    describe('TCP Plugin.', function(){
        it('Should exec method', function(done){
            sandbox.run(function(done){
                sandbox.tcp.exec('echo', ['Hello world'], function(err, result){
                    if (err) return done(err);

                    should(result).equal('Hello world');
                    done();
                });
            }, function(err){
                if (err && err.name === 'AssertionError') {
                    return done(err);
                }

                should(err).equal(null, '`err` should be empty');
                done();
            });
        });
    });


    describe('API plugin.', function(){
        it('Should bind several methods with `register` method', function(done){
            sandbox.api.register({
                api : {
                    method1 : function(done){
                        done(null, true);
                    },
                    method2 : function(done) {
                        done();
                    }
                }
            });

            sandbox.eval('done(null, typeof api.method1, typeof api.method2)', function(err, method1, method2){
                should(err).equal(null, '`err` is null');
                should(method1).equal('function', 'api.method1 should be a function');
                should(method2).equal('function', 'api.method2 should be a function');
                done();
            });
        });

        it('Should bind single value with `bind` method', function(done){
            sandbox.api.bind("bindMethod", function(done) {
                done(null, true);
            });

            sandbox.eval('done(null, typeof bindMethod)', function(err, type){
                should(err).equal(null, '`err` is null');
                should(type).equal('function', 'bindMethod should be function');
                done();
            });
        });

        it('Should call api method', function(done){
            sandbox.eval('api.method1(done)', function(err, result){
                should(err).equal(null, '`err` is null');
                should(result).equal(true, 'Result is `true`');

                done();
            });
        });

        it('Should bind nested value', function(done){
            sandbox.api.bind("api", {name:"test"});

            sandbox.eval("done(null, api.name)", function(err, apiName){
                should(err).equal(null, '`err` is null');
                should(apiName).type("string").and.equal("test");
                done();
            });
        });

        it ('Should register nested method', function(done){
            sandbox.api.register("robot", {
                name : "Bender",
                sayHello : function(done) {
                    done(null, "Hello, " + this.name);
                }
            });

            sandbox.eval("robot.sayHello(done)", function(err, result){
                should(err).be.equal(null);
                should(result).be.a.String.and.be.equal("Hello, Bender");
                done();
            });
        });
    });

    describe('Transactions.', function(){
        it('Should run transactions code', function(done){
            var sandbox = new Sandbox({
                plugins : {
                    process : true,
                    transaction : true
                }
            });

            var transaction = {
                id : 1,
                asset : {
                    input : {
                        data : {}
                    },
                    script : {
                        parameters : {},
                        code : "transaction.run = function(done, input) { done(null, this.SUCCESS); };"
                    }
                }
            };

            sandbox.transaction.exec(transaction, function(err, result){
                should(err).equal(null, '`err` is empty');
                should(result).type('string').and.equal('TRUE', 'Result value is "TRUE"');
                done();
            });
        });
    });

    describe('Context.', function(){
        it('Should register modules in context', function(done){
            var sandbox = new Sandbox({
                plugins : {
                    process : true,
                    context : {
                        async : true,
                        jsonschema : true
                    }
                }
            });

            sandbox.eval('done(null, typeof async !== "undefined" && typeof jsonschema !== "undefined");', function(err, result){
                should(err).equal(null, '`err` is empty');
                should(result).type('boolean').and.equal(true, '`async` and `jsonschema` modules are required');
                done();
            });
        });
    });
});