var should = require('should');
var Browser = require('../phantom-browser.js');

describe('UI interaction', function() {
    var server, addr, browser, postData;

    before(function () {
        var testServer = require('../test-server.js');

        var app = testServer(__dirname + '/ui', {
            'POST /data' : function(req, res, next) {
                postData = req.body;
                res.end('OK');
            }
        });

        browser = new Browser();
        browser.addMacros('gotoTestPage', function(self, path, search){
            this.goto({
                hostname: 'localhost',
                port: addr.port,
                pathname: path || '/',
                search: search
            });
        });

        server = app.listen();
        addr = server.address();
    });

    after(function () {
        server.close();
    });

    describe('select()', function(){
        it('Should select element and remember it', function(done){
            browser
                .openTab()
                .macros('gotoTestPage', 'ui.html')
                .select('#clickMe')
                .eval(function(){
                    return nodejs.$target.id;
                })
                .closeAll()
                .run(function(err, id){
                    should(err).be.equal(null);
                    should(id).have.type('string').and.be.equal('clickMe');

                    done();
                });
        });
    });

    describe('click()', function(){
        it('Should click element by selector', function(done){
            browser
                .openTab()
                .macros('gotoTestPage', 'ui.html')
                .click('#clickMe')
                .eval(function () {
                    return document.title;
                })
                .closeAll()
                .run(function(err, location){
                    should(err).be.equal(null);
                    should(location).have.type('string').and.be.equal('clicked');

                    done();
                });
        });
    });

    describe('text()', function(){
        it('Should return element text', function(done){
            browser
                .openTab()
                .macros('gotoTestPage', 'text.ejs', 'html=hello')
                .text('body')
                .closeAll()
                .run(function(err, location){
                    should(err).be.equal(null);
                    should(location).have.type('string').and.be.equal('hello\n');

                    done();
                });
        });
    });

    describe('html()', function(){
        it('Should return element text', function(done){
            browser
                .openTab()
                .macros('gotoTestPage', 'text.ejs', 'html=<b>test</b>')
                .html('body')
                .closeAll()
                .run(function(err, location){
                    should(err).be.equal(null);
                    should(location).have.type('string').and.be.equal('<b>test</b>\n');

                    done();
                });
        });
    });

    describe('fill()', function(){
        it('Should fill text field', function(done){
            browser
                .openTab()
                .macros('gotoTestPage', 'form.html')
                .fill('#query', 'hello')
                .eval(function(){
                    return document.body.querySelector('#query').value;
                })
                .closeAll()
                .run(function(err, location){
                    should(err).be.equal(null);
                    should(location).have.type('string').and.be.equal('hello');

                    done();
                });
        });

        it('Should check checkbox', function(done){
            browser
                .openTab()
                .macros('gotoTestPage', 'form.html')
                .fill('#check', true)
                .eval(function(){
                    return document.body.querySelector('#check').checked;
                })
                .closeAll()
                .run(function(err, location){
                    should(err).be.equal(null);
                    should(location).have.type('boolean').and.be.equal(true);

                    done();
                });
        });

        it('Should fill radio', function(done){
            browser
                .openTab()
                .macros('gotoTestPage', 'form.html')
                .fill('#radio', true)
                .eval(function(){
                    return document.body.querySelector('#radio').checked;
                })
                .closeAll()
                .run(function(err, location){
                    should(err).be.equal(null);
                    should(location).have.type('boolean').and.be.equal(true);

                    done();
                });
        });
    });

    describe('submit()', function(){
        it('Should fill and submit form', function(done){
            postData = null;
            browser
                .openTab()
                .macros('gotoTestPage', 'form.html')
                .select('form')
                .fill({
                    query: 'hello',
                    radio: 2
                })
                .submit()
                .wait()
                .closeAll()
                .run(function(err){
                    should(err).be.equal(null);
                    should(postData).have.type('object').and.is.not.equal(null);

                    should(postData).ownProperty('query').which.equal('hello');
                    should(postData).ownProperty('radio').which.equal('2');

                    done();
                });
        });
    });
});