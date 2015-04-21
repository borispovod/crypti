var should = require('should');
var Browser = require('../phantom-browser.js');
var assert = require('assert');

describe('Phantom browser', function(){
   describe('Tabs', function(){
       it('Should open unnamed tabs', function(done){
           Browser.create().openTab().run(function(err) {
                var tabs = Object.keys(this._tabs);

                should(err).be.equal(null);
                should(tabs).instanceOf(Array).with.lengthOf(1);
                should(tabs[0]).have.type('string').and.be.equal('tab1');

                done();
           });
       });

       it('Should open named tabs', function(done){
           Browser.create().openTab('A').run(function(err){
               var tabs = Object.keys(this._tabs);

               should(err).be.equal(null);
               should(tabs).instanceOf(Array).with.lengthOf(1);
               should(tabs[0]).have.type('string').and.be.equal('A');

               done();
           });
       });

       it('Should close current tab', function(done){
           Browser.create().openTab().closeTab().run(function(err){
               var tabs = Object.keys(this._tabs);

               should(err).be.equal(null);
               should(tabs).instanceOf(Array).with.lengthOf(0);

               done();
           });
       });

       it('Should open several tabs', function(done){
           Browser.create().openTab('A').openTab('B').openTab('C').run(function(err){
               var tabs = Object.keys(this._tabs);

               should(err).be.equal(null);
               should(tabs).instanceOf(Array).with.lengthOf(3);
               should(tabs[0]).have.type('string').and.be.equal('A');
               should(tabs[1]).have.type('string').and.be.equal('B');
               should(tabs[2]).have.type('string').and.be.equal('C');

               done();
           });
       });

       it('Should close several tabs but last', function(done){
           Browser.create().openTab('A').openTab('B').openTab('C').closeTab().closeTab().run(function(err){
               var tabs = Object.keys(this._tabs);

               should(err).be.equal(null);
               should(tabs).instanceOf(Array).with.lengthOf(1);
               should(tabs[0]).have.type('string').and.be.equal('A');

               done();
           });
       });

       it('Should close several tabs', function(done){
           Browser.create().openTab('A').openTab('B').openTab('C').closeTab().closeTab().closeTab().run(function(err){
               var tabs = Object.keys(this._tabs);

               should(err).be.equal(null);
               should(tabs).instanceOf(Array).with.lengthOf(0);

               done();
           });
       });

       it('It should emit error on switching to closed tab', function(done){
           assert.doesNotThrow(function(){
               Browser.create().openTab('A').openTab('B').closeTab('A').switchTab('A').run(function(err){
                   should(err).not.be.equal(null);

                   done();
               });
           });
       });
   });
});