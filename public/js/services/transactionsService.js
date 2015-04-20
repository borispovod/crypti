require('angular');

angular.module('webApp').service('transactionsService', function ($http, userService) {

    var transactions = {
        getTransactions: function ($defer, params, filter, cb) {
            $http.get("/api/transactions", {
                params: {
                    senderPublicKey: userService.publicKey,
                    recipientId: userService.address,
                    limit: 20,
                    orderBy: 'timestamp:desc'
                }
            })
                .then(function (response) {
                    params.total(5);
                    console.log(response.data.transactions);
                    $defer.resolve(response.data.transactions);
                    cb();
                });
        }
    }

    return transactions;
});