webApp.controller('accountController', ['$scope', '$rootScope', '$http', "userService", "$interval", "sendCryptiModal", "secondPassphraseModal", function($rootScope, $scope, $http, userService, $interval, sendCryptiModal, secondPassphraseModal) {
    $scope.address = userService.address;
    $scope.balance = userService.balance;
    $scope.unconfirmedBalance = userService.unconfirmedBalance;
    $scope.effectiveBalance = userService.effectiveBalance;
    $scope.secondPassphrase = userService.secondPassphrase;
    $scope.unconfirmedPassphrase = userService.unconfirmedPassphrase;

    $scope.getTransactions = function () {
        $http.get("/api/getAddressTransactions", { params : { address : userService.address, limit : 20, descOrder : true }})
            .then(function (resp) {
                $scope.transactions = resp.data.transactions;
            });
    }

    $scope.getBalance = function () {
        $http.get("/api/accounts/getBalance", { params : { address : userService.address }})
            .then(function (resp) {
                userService.balance = resp.data.balance / 100000000;
                userService.unconfirmedBalance = resp.data.unconfirmedBalance / 100000000;
                userService.effectiveBalance = resp.data.effectiveBalance / 100000000;
                userService.secondPassphrase = resp.data.secondPassphrase;
                userService.unconfirmedPassphrase = resp.data.unconfirmedPassphrase;
                $scope.balance = userService.balance;
                $scope.unconfirmedBalance = userService.unconfirmedBalance;
                $scope.effectiveBalance = userService.effectiveBalance;
                $scope.secondPassphrase = userService.secondPassphrase;
                $scope.unconfirmedPassphrase = userService.unconfirmedPassphrase;
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
                $scope.getBalance();
                $scope.getTransactions();
            }
        });
    }

    $scope.addSecondPassphrase = function () {
        $scope.secondPassphraseModal = secondPassphraseModal.activate({
            totalBalance : $scope.unconfirmedBalance,
            destroy: function (r) {
                $scope.getBalance();
                $scope.getTransactions();

                if (r) {
                    $scope.unconfirmedPassphrase = true;
                }
            }
        });
    }

    $scope.getBalance();
    $scope.getTransactions();
}]);