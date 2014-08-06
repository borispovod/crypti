webApp.controller('accountController', ['$scope', '$rootScope', '$http', "userService", "$interval", "sendCryptiModal", "freeModal", "secondPassphraseModal", function($rootScope, $scope, $http, userService, $interval, sendCryptiModal, freeModal, secondPassphraseModal) {
    $scope.address = userService.address;
    $scope.balance = userService.balance;
    $scope.unconfirmedBalance = userService.unconfirmedBalance;
    $scope.effectiveBalance = userService.effectiveBalance ;
    $scope.secondPassphrase = userService.secondPassphrase;

    $scope.getTransactions = function () {
        $http.get("/api/getAllTransactions", { params : { accountId : userService.address }})
            .then(function (resp) {
                $scope.transactions = resp.data.transactions;
            });
    }

    $scope.getBalance = function () {
        $http.get("/api/getBalance", { params : { address : userService.address }})
            .then(function (resp) {
                userService.balance = resp.data.balance;
                userService.unconfirmedBalance = resp.data.unconfirmedBalance;
                userService.effectiveBalance = resp.data.effectiveBalance;
                userService.secondPassphrase = resp.data.secondPassPhrase;
                $scope.balance = userService.balance;
                $scope.unconfirmedBalance = userService.unconfirmedBalance;
                $scope.effectiveBalance = userService.effectiveBalance;
                $scope.secondPassphrase = userService.secondPassphrase;
            });
    }

    $scope.balanceInterval = $interval(function () {
        $scope.getBalance();
    }, 1000 * 10);

    $scope.transactionsInterval = $interval(function () {
        $scope.getTransactions();
    }, 1000 * 10);

    $scope.$on('$destroy', function() {
        $interval.cancel($scope.balanceInterval);
        $scope.balanceInterval = null;

        $interval.cancel($scope.transactionsInterval);
        $scope.transactionsInterval = null;
    });

    $scope.sendCrypti = function () {
        $scope.sendCryptiModal = sendCryptiModal.activate({
            totalBalance : $scope.unconfirmedBalance,
            destroy: function () {
                $scope.getTransactions();
                $scope.getBalance();
            }
        });
    }

    $scope.addSecondPassphrase = function () {
        $scope.secondPassphraseModal = secondPassphraseModal.activate({
            totalBalance : $scope.unconfirmedBalance
        });
    }

    $scope.sendFree = function () {
        var data = { addr : $scope.address };
        $http.post("/api/sendFree",data)
            .then(function (resp) {
                if (resp.data.success) {
                    $scope.getTransactions();
                    $scope.getBalance();
                    freeModal.activate({ msg : "Crypti sent, please, wait around minute" });
                } else {
                    freeModal.activate({ msg : "We already sent Crypti to you, sorry" });
                }
            });
    }

    $scope.getBalance();
    $scope.getTransactions();
}]);