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
        Sandbox = require('../../helpers/sandbox');
        should(Sandbox).type('function', 'Sandbox is a function');
    });

    it('Instance should be an object', function(){
        sandbox = new Sandbox({
            stdio : [null, 1, 2]
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

        it('Sandbox context should has Domain and it should to capture errors.', function(done){
            sandbox.run(readFile('source-domain.js'), function(err){
                should(err).not.equal(null, '`err` is not null');
                should(err).be.instanceof(Object, '`err` instance of Object');
                should(err).hasOwnProperty('message').instanceof(String, '`err.message` is a String');
                done();
            });
        });
    });
});