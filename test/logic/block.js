var should = require('should');
var fs = require('fs');
var _ = require('underscore');
var ed = require('ed25519');
var bignum = require('bignum');
var crypto = require('crypto');
var deepEqual = require('assert').deepEqual;

var dblite = require('../../helpers/dblite.js');
var genesisBlock = require('../../tmp/default/genesisBlock.js');

var Block = require('../../logic/block.js');
var Transaction = require('../../logic/transaction.js');
var Delegates = require('../../modules/delegates.js');

function getAddressByPublicKey(publicKey) {
    var publicKeyHash = crypto.createHash('sha256').update(publicKey, 'hex').digest();
    var temp = new Buffer(8);
    for (var i = 0; i < 8; i++) {
        temp[i] = publicKeyHash[7 - i];
    }

    return bignum.fromBuffer(temp).toString() + "C";
}

function createKeypair(string){
    var hash = crypto.createHash('sha256').update(string, 'utf8').digest();
    return ed.MakeKeypair(hash);
}

describe('Logic Block module.', function(){
    it('Should be a function', function(){
       should(Block).have.type('function');
    });

    it('accept getAddressByPublicKey', function(){
        var kp = createKeypair('test');
        var address = getAddressByPublicKey(kp.publicKey);

        should(address).have.type('string').match(/^[0-9]+C$/).and.be.equal('4599231408004878273C');
    });

    describe('Block instance.', function(){
        var block, transaction, db;
        var dbPath = '../../tmp/chain.db';

        before(function(done){
            block = new Block();
            transaction = new Transaction();

            block.logic = {
                transaction: transaction
            };

            dblite.connect(dbPath, function (err, _db) {
                if (err) return done(err);

                db = _db;
                done();
            });
        });

        after(function(){
            fs.existsSync(dbPath) && fs.unlinkSync(dbPath);
        });

        //it('Should create the same block as genesis block', function(){
        //    var newBlock = block.create(genesisBlock.block);
        //    should(newBlock).have.type('object');
        //    deepEqual(newBlock, genesisBlock.block);
        //});

        it('Should getHash() return a Buffer', function(){
            should(block.getHash(genesisBlock.block)).be.instanceOf(Buffer);
        });

        it('Should accept validate abstract interface', function(){
            should(block).have.type('object');
        });

        it('Should produce id from genesis block', function(){
            should(block.getId(genesisBlock.block)).have.type('string');
        });

        it('Should verify genesis block signature', function(){
            should(block.verifySignature(genesisBlock.block)).have.type('boolean').and.equal(true);
        });

        it('Should throw an error on invalid block.blockSignature', function(){
            should(function(){
                var corruptedBlock = _.clone(genesisBlock.block);
                corruptedBlock.blockSignature = null;
                block.verifySignature();
            }).throw(Error);
        });

        it('Should throw an error on invalid block.publicKey', function(){
            should(function(){
                var corruptedBlock = _.clone(genesisBlock.block);
                corruptedBlock.publicKey = null;
                block.verifySignature();
            }).throw(Error);
        });

        it('Should save genesis block', function(done){
            block.dbSave(db, genesisBlock.block, function(){
                db.query('SELECT * FROM blocks;', function(blocks){
                    should(blocks).be.instanceOf(Array).and.have.lengthOf(1);
                    should(blocks[0]).be.an.instanceOf(Array).and.ownProperty(0).equal(genesisBlock.block.id);
                    done();
                });
            });
        });
    });
});
