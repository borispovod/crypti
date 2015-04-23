var should = require('should');
var Browser = require('../phantom-browser.js');

describe('till()', function(){
    var server, browser;

    before(function(){
        var http = require('http');
        var url = require('url');

        browser = new Browser();

        server = http.createServer(function(req, res){
            // Create multi level age loading
            if (req.url === '/') {
                res.end('<html><head><title>Page</title><link rel="stylesheet" href="/style.css"></head><body>Test page</body><a id="clickMe" href="/iframe">Click me</a></html>');
            } else if (req.url === '/style.css') {
                setTimeout(function() {
                    res.end('html {font-family:Sans-Serif; color: red}');
                }, 2000);
            } else {
                setTimeout(function(){
                    res.end('<html><head><title>Hello</title></head><body>Inner page</body></html>');
                }, 2000);
            }
        });

        server.listen();
    });

    after(function(){
        server.close();
    });

    it('Should executes while command result is true', function(done){
        browser.openTab()
            .goto({
                hostname: 'localhost',
                port: server.address().port
            })
            .click('#clickMe')
            .till(function(){
                this
                    .wait(1, 's')
                    .eval(function(){
                        return document.title !== 'Hello';
                    });
            })
            .closeAll()
            .run(function(err, result){
                should(err).be.equal(null);
                should(result).have.type('boolean').and.be.equal(true);
                done();
            });

    });

    it('Should stops if execution times limit is reached', function(done){
        browser.openTab()
            .goto({
                hostname: 'localhost',
                port: server.address().port
            })
            .click('#clickMe')
            .till(2, function(){
                this
                    .eval(function(){
                        return document.title !== 'FAKE TITLE';
                    });
            })
            .closeAll()
            .run(function(err, result){
                should(err).be.equal(null);
                should(result).have.type('boolean').and.be.equal(false);
                done();
            });
    });
});

describe('until()', function(){
    var server, browser;

    before(function(){
        var http = require('http');
        var url = require('url');

        browser = new Browser();

        server = http.createServer(function(req, res){
            // Create multi level age loading
            if (req.url === '/') {
                res.end('<html><head><title>Page</title><link rel="stylesheet" href="/style.css"></head><body>Test page</body><a id="clickMe" href="/iframe">Click me</a></html>');
            } else if (req.url === '/style.css') {
                setTimeout(function() {
                    res.end('html {font-family:Sans-Serif; color: red}');
                }, 2000);
            } else {
                setTimeout(function(){
                    res.end('<html><head><title>Hello</title></head><body>Inner page</body></html>');
                }, 2000);
            }
        });

        server.listen();
    });

    after(function(){
        server.close();
    });

    it('Should executes while command result is false', function(done){
        browser.openTab()
            .goto({
                hostname: 'localhost',
                port: server.address().port
            })
            .click('#clickMe')
            .until(function(){
                this
                    .wait(1, 's')
                    .eval(function(){
                        return document.title === 'Hello';
                    });
            })
            .closeAll()
            .run(function(err, result){
                should(err).be.equal(null);
                should(result).have.type('boolean').and.be.equal(true);
                done();
            });

    });

    it('Should stops if execution times limit is reached', function(done){
        browser.openTab()
            .goto({
                hostname: 'localhost',
                port: server.address().port
            })
            .click('#clickMe')
            .until(2, function(){
                this
                    .eval(function(){
                        return document.title === 'FAKE TITLE';
                    });
            })
            .closeAll()
            .run(function(err, result){
                should(err).be.equal(null);
                should(result).have.type('boolean').and.be.equal(false);
                done();
            });
    });
});
