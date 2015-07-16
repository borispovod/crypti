/**
 * Ask Sebastian if you have any questions. Last Edit: 22/06/2015
 */

'use strict';

// Requires and node configuration
var node = require('./../variables.js');
var test = 0;
var block = {
    blockHeight : 0,
    id : 0,
    generatorPublicKey : "",
    totalAmount : 0,
    totalFee : 0
};

console.log("Starting Miscellaneous Tests");

describe('Miscellaneous tests (peers, blocks, etc)', function() {

    describe('/peers tests', function(){

        test = test + 1;
        it(test + '. Add peers to local node',function(done){
            var randomNumberOfPeers = node.randomNumber(1,3);
            node.addPeers(randomNumberOfPeers, function () {
                console.log('Added ' + randomNumberOfPeers + ' peers');
            });
            done();
        });

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
                    if (res.body.success == true && res.body.build != null) {
                        node.expect(res.body).to.have.property("version").to.equal(node.version);
                    }
                    else{
                        console.log("Request failed or build object is null");
                        node.expect("true").to.equal("false");
                    }
                    done();
                });
        });

        test = test + 1;
        it(test + '. Get peers list by parameters: none. Expecting error',function(done){
            var state = "", os = "", shared = "", version = "", limit = "", offset = 0, orderBy = "";
            node.api.get('/peers?state='+state+'&os='+os+'&shared='+true+'&version='+version+'&limit='+limit+'&offset='+offset+'orderBy='+orderBy)
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

        test = test + 1;
        it(test + '. Get peers list by parameters: state. Expecting success',function(done){
            var state = 1;
            node.api.get('/peers?state='+state)
                .set('Accept', 'application/json')
                .expect('Content-Type', /json/)
                .expect(200)
                .end(function (err, res){
                    console.log(res.body);
                    node.expect(res.body).to.have.property("success").to.be.true;
                    node.expect(res.body).to.have.property("peers").that.is.an('array');
                    if (res.body.success == true && res.body.peers != null){
                        if (res.body.peers.length > 0){
                            node.expect(res.body.peers.length).to.be.at.most(100);
                            for (var i = 0; i < res.body.peers.length; i++){
                               node.expect(res.body.peers[i].state).to.equal(parseInt(state));
                            }
                        }
                    }
                    else{
                        console.log("Request failed or peers object is null");
                        node.expect("true").to.equal("false");
                    }
                    done();
                });
        });

        test = test + 1;
        it(test + '. Get peers list by parameters: sharePort. Expecting success',function(done){
            var shared = 1, limit = 100, offset = 0;
            node.api.get('/peers?shared='+shared+'&limit='+limit+'&offset='+offset)
                .set('Accept', 'application/json')
                .expect('Content-Type', /json/)
                .expect(200)
                .end(function (err, res){
                    console.log(res.body);
                    node.expect(res.body).to.have.property("success").to.be.true;
                    node.expect(res.body).to.have.property("peers").that.is.an('array');
                    if (res.body.success == true && res.body.peers != null) {
                        if (res.body.peers.length > 0) {
                            for (var i = 0; i < res.body.peers.length; i++) {
                                node.expect(res.body.peers[i].sharePort).to.equal(parseInt(shared));
                            }
                        }
                    }
                    else{
                        console.log("Request failed or peers object is null");
                        node.expect("true").to.equal("false");
                    }
                    done();
                });
        });

        test = test + 1;
        it(test + '. Get peers list by parameters: limit. Expecting success',function(done){
            var limit = 3, offset = 0;
            node.api.get('/peers?&limit='+limit+'&offset='+offset)
                .set('Accept', 'application/json')
                .expect('Content-Type', /json/)
                .expect(200)
                .end(function (err, res){
                    console.log(res.body);
                    node.expect(res.body).to.have.property("success").to.be.true;
                    node.expect(res.body).to.have.property("peers").that.is.an('array');
                    if (res.body.success == true && res.body.peers != null) {
                        // to check it need to have peers
                        node.expect(res.body.peers.length).to.be.at.most(limit);
                    }
                    else{
                        console.log("Request failed or peers object is null");
                        node.expect("true").to.equal("false");
                    }
                    done();
                });
        });

        test = test + 1;
        it(test + '. Get peers list by parameters: orderBy. Expecting success',function(done){
            var orderBy = "state:desc";
            node.api.get('/peers?orderBy='+orderBy)
                .set('Accept', 'application/json')
                .expect('Content-Type', /json/)
                .expect(200)
                .end(function (err, res){
                    console.log(res.body);
                    node.expect(res.body).to.have.property("success").to.be.true;
                    node.expect(res.body).to.have.property("peers").that.is.an('array');
                    if (res.body.success == true && res.body.peers != null) {
                        if (res.body.peers.length > 0) {
                            for (var i = 0; i < res.body.peers.length; i++) {
                                if (res.body.peers[i + 1] != null) {
                                    node.expect(res.body.peers[i + 1].state).to.at.most(res.body.peers[i].state);
                                }
                            }
                        }
                    }
                    else{
                        console.log("Request failed or peers object is null");
                        node.expect("true").to.equal("false");
                    }
                    done();
                });
        });

        test = test + 1;
        it(test + '. Get peers list by parameters but sending limit 99999. Expecting error',function(done){
            var limit = 99999;
            node.api.get('/peers?&limit='+limit)
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

        test = test + 1;
        it(test + '. Get peers list by parameters but sending invalid fields . Expecting success because fields are ORed',function(done){
            var state = "invalid", os = "invalid", shared = "invalid", version = "invalid", limit = "invalid", offset = "invalid", orderBy = "invalid";
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

        test = test + 1;
        it(test + '. Get peer by parameters. Sending missing information. Expecting error',function(done){
            node.api.get('/peers/get')
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

        test = test + 1;
        it(test + '. Get peer by parameters. Expecting error',function(done){
            node.api.get('/peers/get?ip="213.8.59.59"&port=8040')
                .set('Accept', 'application/json')
                .expect('Content-Type', /json/)
                .expect(200)
                .end(function (err, res){
                    console.log(res.body);
                    // WE DON'T KNOW IF PEER EXISTS SO WE ONLY CHECK IT DOESN'T CRASH THE NODE
                    node.expect(res.body).to.have.property("success");
                    done();
                });
        });
    });

    describe('/blocks tests', function() {

        test = test + 1;
        it(test + '. Get block height. Expecting success',function(done){
            node.api.get('/blocks/getHeight')
                .set('Accept', 'application/json')
                .expect('Content-Type', /json/)
                .expect(200)
                .end(function (err, res){
                    console.log(res.body);
                    node.expect(res.body).to.have.property("success").to.be.true;
                    node.expect(res.body).to.have.property("height").to.be.above(0);
                    if (res.body.success == true && res.body.height != null){
                        block.blockHeight = res.body.height;
                    }
                    else {
                        console.log("Request failed or height object is null");
                        node.expect("true").to.equal("false");
                    }
                    done();
                });
        });

        test = test + 1;
        it(test + '. Get current fee. Expecting success',function(done){
            node.api.get('/blocks/getFee')
                .set('Accept', 'application/json')
                .expect('Content-Type', /json/)
                .expect(200)
                .end(function (err, res){
                    console.log(res.body);
                    node.expect(res.body).to.have.property("success").to.be.true;
                    node.expect(res.body).to.have.property("fee");
                    if (res.body.success == true && res.body.fee != null) {
                        node.expect(res.body.fee).to.equal(node.Fees.transactionFee * 100);
                    }
                    else {
                            console.log("Request failed or fee object is null");
                            node.expect("true").to.equal("false");
                    }
                    done();
                });
        });

        test = test + 1;
        it(test + '. Get blocks list by parameters: height. Expecting success',function(done){
            var height = block.blockHeight, limit = 100, offset = 0;
            node.api.get('/blocks?height='+height+'&limit='+limit+'&offset='+offset)
                .set('Accept', 'application/json')
                .expect('Content-Type', /json/)
                .expect(200)
                .end(function (err, res){
                    console.log(res.body);
                    node.expect(res.body).to.have.property("success").to.be.true;
                    node.expect(res.body).to.have.property("blocks").that.is.an('array');
                    if (res.body.success == true && res.body.blocks != null) {
                        node.expect(res.body.blocks).to.have.length(1);
                        node.expect(res.body.blocks[0]).to.have.property("previousBlock");
                        node.expect(res.body.blocks[0]).to.have.property("totalAmount");
                        node.expect(res.body.blocks[0]).to.have.property("totalFee");
                        node.expect(res.body.blocks[0]).to.have.property("generatorId");
                        node.expect(res.body.blocks[0]).to.have.property("confirmations");
                        node.expect(res.body.blocks[0]).to.have.property("blockSignature");
                        node.expect(res.body.blocks[0]).to.have.property("numberOfTransactions");
                        node.expect(res.body.blocks[0].height).to.equal(block.blockHeight);
                        block.id = res.body.blocks[0].id;
                        block.generatorPublicKey = res.body.blocks[0].generatorPublicKey;
                        block.totalAmount = res.body.blocks[0].totalAmount;
                        block.totalFee = res.body.blocks[0].totalFee;
                    }
                    else {
                        console.log("Request failed or blocks object is null");
                        node.expect("true").to.equal("false");
                    }
                    done();
                });
        });

        test = test + 1;
        it(test + '. Get blocks list by parameters: generatorPublicKey. Expecting success',function(done){
            var generatorPublicKey = block.generatorPublicKey, limit = 100, offset = 0, orderBy = "";
            node.api.get('/blocks?generatorPublicKey='+generatorPublicKey+'&limit='+limit+'&offset='+offset)
                .set('Accept', 'application/json')
                .expect('Content-Type', /json/)
                .expect(200)
                .end(function (err, res){
                    console.log(res.body);
                    node.expect(res.body).to.have.property("success").to.be.true;
                    node.expect(res.body).to.have.property("blocks").that.is.an('array');
                    if (res.body.success == true && res.body.blocks != null) {
                        for (var i = 0; i < res.body.blocks.length; i++) {
                            node.expect(res.body.blocks[i].generatorPublicKey).to.equal(block.generatorPublicKey);
                        }
                    }
                    else {
                        console.log("Request failed or blocks object is null");
                        node.expect("true").to.equal("false");
                    }
                    done();
                });
        });

        test = test + 1;
        it(test + '. Get blocks list by parameters: totalFee. Expecting success',function(done){
            var totalFee = block.totalFee, limit = 100, offset = 0;
            node.api.get('/blocks?totalFee='+totalFee+'&limit='+limit+'&offset='+offset)
                .set('Accept', 'application/json')
                .expect('Content-Type', /json/)
                .expect(200)
                .end(function (err, res){
                    console.log(res.body);
                    node.expect(res.body).to.have.property("success").to.be.true;
                    node.expect(res.body).to.have.property("blocks").that.is.an('array');
                    if (res.body.success == true && res.body.blocks != null){
                        for (var i = 0; i < res.body.blocks.length; i++){
                            node.expect(res.body.blocks[i].totalFee).to.equal(block.totalFee);
                        }
                    }
                    else {
                        console.log("Request failed or blocks object is null");
                        node.expect("true").to.equal("false");
                    }
                    done();
                });
        });

        test = test + 1;
        it(test + '. Get blocks list. No limit. Expecting success',function(done){
            node.api.get('/blocks?totalFee=0')
                .set('Accept', 'application/json')
                .expect('Content-Type', /json/)
                .expect(200)
                .end(function (err, res){
                    console.log(res.body);
                    node.expect(res.body).to.have.property("success").to.be.true;
                    node.expect(res.body).to.have.property("blocks").that.is.an('array');
                    if (res.body.success == true && res.body.blocks != null){
                        node.expect(res.body.blocks.length).to.be.at.most(100);
                    }
                    else{
                        console.log("Request failed or blocks object is null");
                        node.expect("true").to.equal("false");
                    }
                    done();
                });
        });

        test = test + 1;
        it(test + '. Get blocks list by generatorPublicKey with no limit. Expecting success',function(done){
            node.api.get('/blocks?generatorPublicKey=' + node.Eaccount.publicKey)
                .set('Accept', 'application/json')
                .expect('Content-Type', /json/)
                .expect(200)
                .end(function (err, res){
                    console.log(res.body);
                    node.expect(res.body).to.have.property("success").to.be.true;
                    node.expect(res.body).to.have.property("blocks").that.is.an('array');
                    if (res.body.success == true && res.body.blocks != null){
                        node.expect(res.body.blocks.length).to.be.at.most(100);
                    }
                    else{
                        console.log("Request failed or blocks object is null");
                        console.log("Sent: /blocks?generatorPublicKey=" + node.Eaccount.publicKey);
                        node.expect("true").to.equal("false");
                    }
                    done();
                });
        });

        test = test + 1;
        it(test + '. Get blocks list by parameters: totalAmount. Expecting success',function(done){
            var totalAmount = block.totalAmount, limit = 100, offset = 0;
            node.api.get('/blocks?totalAmount='+totalAmount+'&limit='+limit+'&offset='+offset)
                .set('Accept', 'application/json')
                .expect('Content-Type', /json/)
                .expect(200)
                .end(function (err, res){
                    console.log(res.body);
                    node.expect(res.body).to.have.property("success").to.be.true;
                    node.expect(res.body).to.have.property("blocks").that.is.an('array');
                    if (res.body.success == true && res.body.blocks != null) {
                        for (var i = 0; i < res.body.blocks.length; i++) {
                            node.expect(res.body.blocks[i].totalAmount).to.equal(block.totalAmount);
                        }
                    }
                    else{
                        console.log("Request failed or blocks object is null");
                        node.expect("true").to.equal("false");
                    }
                    done();
                });
        });

        test = test + 1;
        it(test + '. Get blocks list by parameters: previousBlock. Expecting success',function(done){
            var previousBlock = block.id;
            node.onNewBlock(function(err){
                node.expect(err).to.be.not.ok;
                node.api.get('/blocks?previousBlock='+previousBlock)
                    .set('Accept', 'application/json')
                    .expect('Content-Type', /json/)
                    .expect(200)
                    .end(function (err, res){
                        console.log(res.body);
                        node.expect(res.body).to.have.property("success").to.be.true;
                        node.expect(res.body).to.have.property("blocks").that.is.an('array');
                        if (res.body.success == true && res.body.blocks != null) {
                            node.expect(res.body.blocks).to.have.length(1);
                            node.expect(res.body.blocks[0].previousBlock).to.equal(block.id);
                        }
                        else{
                            console.log("Request failed or blocks object is null");
                            node.expect("true").to.equal("false");
                        }
                        done();
                    });
            });
        });

        test = test + 1;
        it(test + '. Get blocks list by parameters: orderBy. Expecting success',function(done){
            var orderBy = "height:desc";
            node.api.get('/blocks?orderBy='+orderBy)
                .set('Accept', 'application/json')
                .expect('Content-Type', /json/)
                .expect(200)
                .end(function (err, res){
                    console.log(res.body);
                    node.expect(res.body).to.have.property("success").to.be.true;
                    node.expect(res.body).to.have.property("blocks").that.is.an('array');
                    if (res.body.success == true && res.body.blocks != null) {
                        for (var i = 0; i < res.body.blocks.length; i++) {
                            if (res.body.blocks[i + 1] != null) {
                                node.expect(res.body.blocks[i].height).to.be.above(res.body.blocks[i + 1].height);
                            }
                        }
                    }
                    else{
                        console.log("Request failed or blocks object is null");
                        node.expect("true").to.equal("false");
                    }
                    done();
                });
        });
    });
});