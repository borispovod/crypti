require('angular');

angular.module('webApp').controller('accountController', ['$scope', '$rootScope', '$http', "userService", "$interval", "sendCryptiModal", "secondPassphraseModal", "delegateService", 'viewFactory', 'transactionInfo', 'userInfo',
    function ($rootScope, $scope, $http, userService, $interval, sendCryptiModal, secondPassphraseModal, delegateService, viewFactory, transactionInfo, userInfo) {
        $scope.view = viewFactory;
        $scope.view.page = {title: 'Dashboard', previos: null};
        $scope.delegate = undefined;
        $scope.address = userService.address;
        $scope.publicKey = userService.publicKey;
        $scope.balance = userService.balance;
        $scope.unconfirmedBalance = userService.unconfirmedBalance;
        $scope.secondPassphrase = userService.secondPassphrase;
        $scope.unconfirmedPassphrase = userService.unconfirmedPassphrase;
        $scope.transactionsLoading = true;
        $scope.allVotes = 100
        * 1000
        * 1000
        * 1000
        * 1000
        * 100;

        $scope.transactionInfo = function (block) {
            $scope.modal = transactionInfo.activate({block: block});
        }

        $scope.userInfo = function (userId) {
            $scope.modal = userInfo.activate({userId: userId});
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

        $scope.$on('socket:transactions', function (ev, data) {
            delegateService.getDelegate($scope.publicKey, function (response) {
                $scope.delegate = response;
            });
            $scope.getAccount();
            $scope.getTransactions();
        });


        $scope.$on('$destroy', function () {
            $interval.cancel($scope.balanceInterval);
            $scope.balanceInterval = null;

            $interval.cancel($scope.transactionsInterval);
            $scope.transactionsInterval = null;
        });

        $scope.sendCrypti = function () {
            $scope.sendCryptiModal = sendCryptiModal.activate({
                totalBalance: $scope.unconfirmedBalance,
                destroy: function () {
                    $scope.getAccount();
                    $scope.getTransactions();
                }
            });
        }

        $scope.addSecondPassphrase = function () {
            $scope.secondPassphraseModal = secondPassphraseModal.activate({
                totalBalance: $scope.unconfirmedBalance,
                destroy: function (r) {
                    $scope.getAccount();
                    $scope.getTransactions();

                    if (r) {
                        $scope.unconfirmedPassphrase = true;
                    }
                }
            });
        }

        $scope.getAccount();
        $scope.getTransactions();
        delegateService.getDelegate($scope.publicKey, function (response) {
            $scope.delegate = response;
        });
    }]);