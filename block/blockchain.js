var genesisblock = require("./genesisblock.js"),
    crypto = require('crypto'),
    block = require("./block.js"),
    transaction = require('../transactions');

var blockchain = function (db) {
    this.db = db;
}

blockchain.prototype.findBlock = function (blockId, cb) {
    this.db.serialize(function () {
        var s = this.db.prepare("SELECT * FROM block WHERE id=? LIMIT 1");
        s.bind(blockId);

        s.get(function (err, row) {
           if (err) {
               cb(err);
           } else {
                cb(null, row);
           }
        });
    }.bind(this));
}

blockchain.prototype.pushBlock = function (b, cb) {
    b.getId(function (err, id) {
       if (err) {
           cb(err);
       }  else {
           this.db.serialize(function () {
               var s = this.db.prepare("INSERT INTO block (id, timestamp, height, generatorId, generatorPubKey, totalAmount, blockSignature, generationSignature) VALUES(?, ?, ?, ?, ?, ?, ?, ?)");
               s.bind([id, b.timestamp, b.height || 0, b.generatorId, b.generatorPublicKey, b.totalAmount, b.blockSignature.toString('hex'), b.generationSignature.toString('hex') ]);
               s.run(function (err) {
                   if (err) {
                       cb(err);
                   } else {
                       for (var i = 0; i < b.transactions.length; i++) {
                           var t = b.transactions[i];
                           var s = this.db.prepare("INSERT INTO trs (id, blockId, timestamp, senderPublicKey, senderId, recipientId, amount, deadline, fee, signature) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                           s.bind([t.getId(), id, t.timestamp, t.senderPublicKey, t.senderId, t.recipientId, t.amount, t.deadline, t.fee, t.signature.toString('hex')]);
                           s.run(function (err) {
                               if (err) {
                                   cb(err);
                               } else {
                                   cb();
                               }
                           });
                       }
                   }
               }.bind(this));
           }.bind(this));
       }
    }.bind(this));

}

module.exports.init = function (db, cb) {
    var bc = new blockchain(db);

    bc.findBlock(genesisblock.blockId, function (err, gb) {
        if (err) {
            cb(err);
        } else {
            if (gb) {
                cb(null, bc);
            } else {
                // creating genesis block
                var t = new transaction(0, genesisblock.publicKey, genesisblock.recipient, genesisblock.recipient, genesisblock.amount, 0, 0, new Buffer(genesisblock.trSignature));
                var thash = crypto.createHash('sha256').update(JSON.stringify(t)).digest();
                var gb = new block(0, genesisblock.amount, 0, genesisblock.publicKey, genesisblock.recipient, thash, new Buffer(genesisblock.blockSignature), [t]);

                bc.pushBlock(gb, function (err) {
                    if (err) {
                        cb(err);
                    } else {
                        cb(null, bc);
                    }
                });
            }
        }
    });
}