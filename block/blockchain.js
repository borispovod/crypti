var blockchain = function (db) {
    this.db = db;
}

blockchain.prototype.findBlock = function (blockId, cb) {
    this.db.serialize(function () {
        var s = this.db.prepare("SELECT * FROM block WHERE id=? LIMIT 1");
        s.bind(blockid);
        s.get(function (err, row) {
           if (err) {
               cb(err);
           } else {

               cb(null);
           }
        });
    }.bind(this));
}

module.exports.init = function (db) {
    var bc = new blockchain(db);

}

