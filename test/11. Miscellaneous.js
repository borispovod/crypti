/**
 * Ask Sebastian if you have any questions. Last Edit: 22/06/2015
 */

'use strict';

// Requires and node configuration
var node = require('./variables.js');
var test = 0;

console.log("Starting Miscellaneous Tests");

describe('Miscellaneous tests (peers, blocks, etc)', function() {

    test = test + 1;
    it(test + '. Get version of node. Expecting success',function(done){
        node.api.get('/peers/version')
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/)
            .expect(200)
            .end(function (err, res){
                console.log(res.body);
                node.expect(res.body).to.have.property("success").to.be.true;
                node.expect(res.body).to.have.property("build");
                node.expect(res.body).to.have.property("version").to.be(node.version);
                done();
            });
    });

    test = test + 1;
    it(test + '. Get peers list by parameters: none. Expecting success',function(done){
        var state = "", os = "", shared = "", version = "", limit = "", offset = 0, orderBy = "";
        node.api.get('/peers?state='+state+'&os='+os+'&shared='+shared+'&version='+version+'&limit='+limit+'&offset='+offset+'orderBy='+orderBy)
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/)
            .expect(200)
            .end(function (err, res){
                console.log(res.body);
                node.expect(res.body).to.have.property("success").to.be.true;
                node.expect(res.body).to.have.property("peers").that.is.an('array');
                done();
            });
    });

    test = test + 1;
    it(test + '. Get peers list by parameters: state. Expecting success',function(done){
        var state = "1", os = "", shared = "", version = "", limit = 100, offset = 0, orderBy = "";
        node.api.get('/peers?state='+state+'&os='+os+'&shared='+shared+'&version='+version+'&limit='+limit+'&offset='+offset+'orderBy='+orderBy)
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/)
            .expect(200)
            .end(function (err, res){
                console.log(res.body);
                node.expect(res.body).to.have.property("success").to.be.true;
                node.expect(res.body).to.have.property("peers").that.is.an('array');
                if (res.body.peers.length > 0){
                    for (var i = 0; i < res.body.peers.length; i++){
                       node.expect(res.body.peers[i].state).to.equal(state);
                    }
                }
                done();
            });
    });

    test = test + 1;
    it(test + '. Get peers list by parameters: sharePort. Expecting success',function(done){
        var state = "", os = "", shared = "1", version = "", limit = 100, offset = 0, orderBy = "";
        node.api.get('/peers?state='+state+'&os='+os+'&shared='+shared+'&version='+version+'&limit='+limit+'&offset='+offset+'orderBy='+orderBy)
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/)
            .expect(200)
            .end(function (err, res){
                console.log(res.body);
                node.expect(res.body).to.have.property("success").to.be.true;
                node.expect(res.body).to.have.property("peers").that.is.an('array');
                if (res.body.peers.length > 0){
                    for (var i = 0; i < res.body.peers.length; i++){
                        node.expect(res.body.peers[i].sharePort).to.equal(shared);
                    }
                }
                done();
            });
    });

    test = test + 1;
    it(test + '. Get peers list by parameters: limit. Expecting success',function(done){
        var state = "", os = "", shared = "", version = "", limit = 3, offset = 0, orderBy = "";
        node.api.get('/peers?state='+state+'&os='+os+'&shared='+shared+'&version='+version+'&limit='+limit+'&offset='+offset+'orderBy='+orderBy)
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/)
            .expect(200)
            .end(function (err, res){
                console.log(res.body);
                node.expect(res.body).to.have.property("success").to.be.true;
                node.expect(res.body).to.have.property("peers").that.is.an('array');
                node.expect(res.body.peers.length).to.be.at.most(limit);
                done();
            });
    });

    test = test + 1;
    it(test + '. Get peers list by parameters: orderBy. Expecting success',function(done){
        var state = "", os = "", shared = "", version = "", limit = 100, offset = 0, orderBy = "state:desc";
        node.api.get('/peers?state='+state+'&os='+os+'&shared='+shared+'&version='+version+'&limit='+limit+'&offset='+offset+'orderBy='+orderBy)
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/)
            .expect(200)
            .end(function (err, res){
                console.log(res.body);
                node.expect(res.body).to.have.property("success").to.be.true;
                node.expect(res.body).to.have.property("peers").that.is.an('array');
                if (res.body.peers.length > 0){
                    for (var i = 0; i < res.body.peers.length; i++){
                        if (res.body.peers[i+1] != null){
                            node.expect(res.body.peers[i+1].state).to.at.most(res.body.peers[i].state);
                        }
                    }
                }
                done();
            });
    });

    test = test + 1;
    it(test + '. Get peers list by parameters but sending limit 99999. Expecting error',function(done){
        var state = "", os = "", shared = "", version = "", limit = 99999, offset = 0, orderBy = "";
        node.api.get('/peers?state='+state+'&os='+os+'&shared='+shared+'&version='+version+'&limit='+limit+'&offset='+offset+'orderBy='+orderBy)
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/)
            .expect(200)
            .end(function (err, res){
                console.log(res.body);
                node.expect(res.body).to.have.property("success").to.be.false;
                node.expect(res.body).to.have.property("error");
                done();
            });
    });

});