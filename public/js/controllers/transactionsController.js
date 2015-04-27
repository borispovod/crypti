require('angular');

angular.module('webApp').controller('transactionsController', ['$scope', '$rootScope', '$http', "userService", "$interval", "sendCryptiModal", "secondPassphraseModal", "delegateService", 'viewFactory', 'transactionsService', 'ngTableParams', 'transactionInfo',
    function ($rootScope, $scope, $http, userService, $interval, sendCryptiModal, secondPassphraseModal, delegateService, viewFactory, transactionsService, ngTableParams, transactionInfo) {
        $scope.view = viewFactory;
        $scope.view.page = {title: 'Transactions', previos: 'main.dashboard'};

        $scope.transactionInfo = function (block) {
            $scope.modal = transactionInfo.activate({block: block});
        }

        $scope.getTransactions = function () {
            $http.get("/api/transactions", {
                params: {
                    senderPublicKey: userService.publicKey,
                    recipientId: $scope.address,
                    limit: 20,
                    orderBy: 'timestamp:desc'
                }
            })
                .then(function (resp) {
                    var transactions = resp.data.transactions;

                    $http.get('/api/transactions/unconfirmed', {
                        params: {
                            senderPublicKey: userService.publicKey,
                            address: userService.address
                        }
                    })
                        .then(function (resp) {
                            var unconfirmedTransactions = resp.data.transactions;
                            $scope.transactions = unconfirmedTransactions.concat(transactions);
                        });
                });
        }


        //Blocks
        $scope.tableTransactions = new ngTableParams({
            page: 1,
            count: 5
        }, {
            total: 0,
            counts: [],
            getData: function ($defer, params) {
                $scope.loading = true;
                transactionsService.getTransactions($defer, params, $scope.filter, function () {
                    $scope.loading = false;
                });
            }
        });

        $scope.tableTransactions.settings().$scope = $scope;

        $scope.$watch("filter.$", function () {
            $scope.tableTransactions.reload();
        });

        //end Blocks

        $scope.getAccount = function () {
            $http.get("/api/accounts", {params: {address: userService.address}})
                .then(function (resp) {
                    var account = resp.data.account;
                    userService.balance = account.balance / 100000000;
                    userService.unconfirmedBalance = account.unconfirmedBalance / 100000000;
                    userService.secondPassphrase = account.secondSignature;
                    userService.unconfirmedPassphrase = account.unconfirmedSignature;
                    $scope.balance = userService.balance;
                    $scope.unconfirmedBalance = userService.unconfirmedBalance;
                    $scope.secondPassphrase = userService.secondPassphrase;
                    $scope.unconfirmedPassphrase = userService.unconfirmedPassphrase;
                });
        }


        $scope.balanceInterval = $interval(function () {
            $scope.getAccount();
        }, 1000 * 10);

        $scope.transactionsInterval = $interval(function () {
            $scope.getTransactions();
        }, 1000 * 10);

        $scope.$on('$destroy', function () {
            $interval.cancel($scope.balanceInterval);
            $scope.balanceInterval = null;

            $interval.cancel($scope.transactionsInterval);
            $scope.transactionsInterval = null;
        });

        $scope.getAccount();
        $scope.getTransactions();

    }]);