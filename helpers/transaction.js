var fixedPoint = Math.pow(10, 8);

// get valid transaction fee, if we need to get fee for block generator, use isGenerator = true
function getTransactionFee(transaction, isGenerator) {
    var fee = -1;

    switch (transaction.type) {
        case 0:
            switch (transaction.subtype) {
                case 0:
                    fee = transaction.fee;
                    break;
            }
            break;

        case 1:
            switch (transaction.subtype) {
                case 0:
                    if (transaction.fee >= 2) {
                        if (transaction.fee % 2 != 0) {
                            var tmp = parseInt(transaction.fee / 2);

                            if (isGenerator) {
                                fee = transaction.fee - tmp;
                            } else {
                                fee = tmp;
                            }
                        } else {
                            fee = transaction.fee / 2;
                        }
                    } else {
                        if (isGenerator) {
                            fee = transaction.fee;
                        } else {
                            fee = 0;
                        }
                    }
                    break;
            }
            break;

        case 2:
            switch (transaction.subtype) {
                case 0:
                    fee = transaction.fee;
                    break;
            }
            break;

        case 3:
            switch (transaction.subtype) {
                case 0:
                    fee = 100 * fixedPoint;
                    break;
            }
            break;
    }

    if (fee == -1) {
        throw new Error("Invalid transaction type: " + t.id);
    }

    return fee;
}

module.exports = {
    getTransactionFee : getTransactionFee,
    fixedPoint : fixedPoint
};