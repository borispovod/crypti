var block = function (timestamp, totalAmount, totalFee, generatorPublicKey, generationSignature, blockSignature, transactions) {
    this.timestamp = timestamp;
    this.totalAmount = totalAmount;
    this.totalFee = totalFee;
    this.generatorPublicKey = generatorPublicKey;
    this.generationSignature = generationSignature;
    this.blockSignature = blockSignature;
    this.transactions = transactions;
}

module.exports = block;