var crypto = require('crypto'),
    curve  = require('curve25519'),
    bignum = require('bignum');
    
module.exports = function (app) {
    app.get("/unlock", function (req, res) {
        var username = req.query.username || "",
            password = req.query.password || "";
       
        var shasum = crypto.createHash('sha256');
        shasum.update(username + password, 'utf8');
        var buffer = shasum.digest();
        
        var privateKey = curve.makeSecretKey(buffer);
        var publicKey = curve.derivePublicKey(privateKey);
        
        shasum = crypto.createHash('sha256');
        shasum.update(publicKey);
        var publicKeyHash = shasum.digest();
        var temp = new Buffer(8);
        for (var i = 0; i < 8; i++) {
            temp[i] = publicKeyHash[7-i];
        }
        
        var address = bignum.fromBuffer(temp).toString() + "C";
        
        res.json({ publicKey : publicKey.toString('hex'), address : address });
    });
}
