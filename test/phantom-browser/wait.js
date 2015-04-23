var should = require('should');
var Browser = require('../phantom-browser.js');

describe('wait()', function(){
    var browser, server;

    before(function(){
        browser = new Browser();
        var http = require('http');
        var url = require('url');

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

    it('It should wait load event', function(done){
        browser
            .openTab()
            .goto({
                hostname: '0.0.0.0',
                port: server.address().port
            })
            .click('#clickMe')
            .wait()
            .eval(function(){
                return document.title;
            })
            .closeAll()
            .run(function(err, title){
                should(err).be.equal(null);
                should(title).have.type('string').and.be.equal('Hello');

                done();
            });
    });

    it('Should wait timeout in seconds', function(done){
        browser
            .openTab()
            .goto({
                hostname: 'localhost',
                port: server.address().port
            })
            .click('#clickMe')
            .wait(3, 'sec')
            .eval(function(){
                return document.title;
            })
            .closeAll()
            .run(function(err, title){
                should(err).be.equal(null);
                should(title).have.type('string').and.be.equal('Hello');

                done();
            });
    });

    it('Should wait timeout in minutes', function(done){
        browser
            .openTab()
            .goto({
                hostname: 'localhost',
                port: server.address().port
            })
            .click('#clickMe')
            .wait(0.05, 'min')
            .eval(function(){
                return document.title;
            })
            .closeAll()
            .run(function(err, title){
                should(err).be.equal(null);
                should(title).have.type('string').and.be.equal('Hello');

                done();
            });
    });

    it('Should wait timeout in hours', function(done){
        browser
            .openTab()
            .goto({
                hostname: 'localhost',
                port: server.address().port
            })
            .click('#clickMe')
            .wait(0.00084, 'hour')
            .eval(function(){
                return document.title;
            })
            .closeAll()
            .run(function(err, title){
                should(err).be.equal(null);
                should(title).have.type('string').and.be.equal('Hello');

                done();
            });
    });
});
