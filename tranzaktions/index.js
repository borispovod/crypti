var deadline; // private final short
var senderPublicKey; // private final byte[]
var recipientId; // private final Long
var amount; // private final int
var fee; // private final int
var referencedTransactionId; // private final Long
var type; // private final TransactionType

var height = 2147483647; // private int
var blockId; // private Long
var block; // private volatile Block
var signature; // private byte[]
var timestamp; // private int
var blockTimestamp = -1; // private int
var attachment; // private Attachment
var id; // private volatile Long
var stringId = null; // private volatile String
var senderId; // private volatile Long
var hash; // private volatile String


var bignum = require('bignum');
var crypto = require('crypto');
var convert = require('utils/convert');
var account = require('account');

function TransactionImpl(type, timestamp, deadline, senderPublicKey, recipientId,
    amount, fee, referencedTransactionId, signature) {

    if ((timestamp == 0 && Arrays.equals(senderPublicKey, Genesis.CREATOR_PUBLIC_KEY)) ? (deadline != 0 || fee != 0) : (deadline < 1 || fee <= 0)
        || fee > Constants.MAX_BALANCE || amount < 0 || amount > Constants.MAX_BALANCE || type == null) {
        throw new NxtException.ValidationException("Invalid transaction parameters:\n type: " + type + ", timestamp: " + timestamp
            + ", deadline: " + deadline + ", fee: " + fee + ", amount: " + amount);
    }

    this.timestamp = timestamp;
    this.deadline = deadline;
    this.senderPublicKey = senderPublicKey;
    this.recipientId = recipientId;
    this.amount = amount;
    this.fee = fee;
    this.referencedTransactionId = referencedTransactionId;
    this.signature = signature;
    this.type = type;
}

function TransactionImpl(type, timestamp, deadline, senderPublicKey, recipientId,
    amount, fee, referencedTransactionId, signature, blockId, height,
    id, senderId, attachment, hash, blockTimestamp)
{
    this(type, timestamp, deadline, senderPublicKey, recipientId, amount, fee, referencedTransactionId, signature);
    this.blockId = blockId;
    this.height = height;
    this.id = id;
    this.senderId = senderId;
    this.attachment = attachment;
    this.hash = hash == null ? null : convert.toHexString(hash);
    this.blockTimestamp = blockTimestamp;
}

function getDeadline() {
    return deadline;
}

function getSenderPublicKey() {
    return senderPublicKey;
}

function getRecipientId() {
    return recipientId;
}

function getAmount() {
    return amount;
}

function getFee() {
    return fee;
}

function getReferencedTransactionId() {
    return referencedTransactionId;
}

function getHeight() {
    return height;
}

function getSignature() {
    return signature;
}

function getType() {
    return type;
}

function getBlockId() {
    return blockId;
}

function getBlock() {
    if (block == null) {
        block = BlockDb.findBlock(blockId);
    }
    return block;
}

function setBlock(block) {
    this.block = block;
    this.blockId = block.getId();
    this.height = block.getHeight();
    this.blockTimestamp = block.getTimestamp();
}

function getTimestamp() {
    return timestamp;
}

function getBlockTimestamp() {
    return blockTimestamp;
}

function getExpiration() {
    return timestamp + deadline * 60;
}

function getAttachment() {
    return attachment;
}

function setAttachment(attachment) {
    this.attachment = attachment;
}

function getId() {
    if (id == null) {
        if (signature == null) {
            return; // throw new IllegalStateException("Transaction is not signed yet");
        }

        var shasum = crypto.createHash('sha256');
        shasum.update(getBytes(), 'utf8');
        var publicKeyHash = shasum.digest();
        var temp = new Buffer(8);
        for (var i = 0; i < 8; i++) {
            temp[i] = publicKeyHash[7-i];
        }
        var bigInteger = bignum.fromBuffer(temp).toString() + "C";
        id = bigInteger.toNumber();
        stringId = bigInteger.toString();
    }
    return id;
}

function getStringId() {
    if (stringId == null) {
        getId();
        if (stringId == null) {
            stringId = convert.toUnsignedLong(id);
        }
    }
    return stringId;
}

function getSenderId() {
    if (senderId == null) {
        senderId = account.getID(senderPublicKey);
    }
    return senderId;
}

function compareTo(o) {

    if (height < o.getHeight()) {
        return -1;
    }
    if (height > o.getHeight()) {
        return 1;
    }
    // equivalent to: fee * 1048576L / getSize() > o.fee * 1048576L / o.getSize()
    if (fee * o.getSize() > o.getFee() * getSize()) {
        return -1;
    }
    if (fee * o.getSize() < o.getFee() * getSize()) {
        return 1;
    }
    if (timestamp < o.getTimestamp()) {
        return -1;
    }
    if (timestamp > o.getTimestamp()) {
        return 1;
    }
    if (getId() < o.getId()) {
        return -1;
    }
    if (getId() > o.getId()) {
        return 1;
    }
    return 0;
}

var TRANSACTION_BYTES_LENGTH = 128; // static final int // 1 + 1 + 4 + 2 + 32 + 8 + 4 + 4 + 8 + 64

function getSize() {
    return TRANSACTION_BYTES_LENGTH + (attachment == null ? 0 : attachment.getSize());
}
// TODO Переписать
function getBytes() {

    ByteBuffer buffer = ByteBuffer.allocate(getSize());
    buffer.order(ByteOrder.LITTLE_ENDIAN);
    buffer.put(type.getType());
    buffer.put(type.getSubtype());
    buffer.putInt(timestamp);
    buffer.putShort(deadline);
    buffer.put(senderPublicKey);
    buffer.putLong(convert.nullToZero(recipientId));
    buffer.putInt(amount);
    buffer.putInt(fee);
    buffer.putLong(convert.nullToZero(referencedTransactionId));
    buffer.put(signature != null ? signature : new byte[64]);
    if (attachment != null) {
        buffer.put(attachment.getBytes());
    }
    return buffer.array();

}

function getJSONObject() {

    var json = {
        "type": type.getType(),
        "subtype": type.getSubtype(),
        "timestamp": timestamp,
        "deadline": deadline,
        "senderPublicKey": convert.toHexString(senderPublicKey),
        "recipient": convert.toUnsignedLong(recipientId),
        "amount": amount,
        "fee": fee,
        "referencedTransaction": convert.toUnsignedLong(referencedTransactionId),
        "signature": convert.toHexString(signature)
    };

    if (attachment != null) {
        json.attachment = attachment.getJSON();
    }

    return json;
}
// TODO crypto
function sign(secretPhrase) {
    if (signature != null) {
        throw new IllegalStateException("Transaction already signed");
    }
    signature = Crypto.sign(getBytes(), secretPhrase);
}

function getHash() {
    if (hash == null) {
        var data = getBytes();
        for (var i = 64; i < 128; i++) {
            data[i] = 0;
        }
        var shasum = crypto.createHash('sha256');
        shasum.update(data, 'utf8');
        var dataHash = shasum.digest();

        hash = convert.toHexString(dataHash);
    }
    return hash;
}

function equals(o) {
    return o instanceof TransactionImpl && this.getId().equals(o.getId());
}

function hashCode() {
    return getId().hashCode();
}
// TODO Account
function verify() {
    var acc = account.getAccount(getSenderId());
    if (acc == null) {
        return false;
    }
    var data = getBytes();
    for (var i = 64; i < 128; i++) {
        data[i] = 0;
    }
    return Crypto.verify(signature, data, senderPublicKey) && acc.setOrVerify(senderPublicKey, this.getHeight());
}

function validateAttachment() {
    type.validateAttachment(this);
}

// returns false if double spending TODO Account
function applyUnconfirmed() {
    var senderAccount = account.getAccount(getSenderId());
    if (senderAccount == null) {
        return false;
    }
    synchronized(senderAccount) {
        return type.applyUnconfirmed(this, senderAccount);
    }
}
// TODO Account
function apply() {
    Account senderAccount = Account.getAccount(getSenderId());
    senderAccount.apply(senderPublicKey, this.getHeight());
    Account recipientAccount = Account.getAccount(recipientId);
    if (recipientAccount == null) {
        recipientAccount = Account.addOrGetAccount(recipientId);
    }
    type.apply(this, senderAccount, recipientAccount);
}
// TODO Account
function undoUnconfirmed() {
    Account senderAccount = Account.getAccount(getSenderId());
    type.undoUnconfirmed(this, senderAccount);
}

// NOTE: when undo is called, lastBlock has already been set to the previous block TODO Account
function undo(){
    Account senderAccount = Account.getAccount(senderId);
    senderAccount.undo(this.getHeight());
    Account recipientAccount = Account.getAccount(recipientId);
    type.undo(this, senderAccount, recipientAccount);
}
// TODO Переписать
function updateTotals(accumulatedAmounts, accumulatedAssetQuantities) {
    var senderId = getSenderId();
    var accumulatedAmount = accumulatedAmounts.get(senderId);
    if (accumulatedAmount == null) {
        accumulatedAmount = 0;
    }
    accumulatedAmounts.put(senderId, accumulatedAmount + (amount + fee) * 100);
    type.updateTotals(this, accumulatedAmounts, accumulatedAssetQuantities, accumulatedAmount);
}

function isDuplicate(duplicates) {
    return type.isDuplicate(this, duplicates);
}