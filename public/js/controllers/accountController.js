webApp.controller('accountController', ['$scope', '$rootScope', '$http', "userService", "$interval", "sendCryptiModal", "secondPassphraseModal", function($rootScope, $scope, $http, userService, $interval, sendCryptiModal, secondPassphraseModal) {
    $scope.address = userService.address;
    $scope.balance = userService.balance;
    $scope.unconfirmedBalance = userService.unconfirmedBalance;
    $scope.secondPassphrase = userService.secondPassphrase || false;
    $scope.unconfirmedPassphrase = userService.unconfirmedPassphrase || false;
	$scope.transactionsLoading = true;

    $scope.getTransactions = function () {
        $http.get("/api/transactions", { params : { senderPublicKey : userService.senderPublicKey, recipientId : $scope.address, limit : 20, orderBy : 'timestamp' }})
            .then(function (resp) {
                $scope.transactions = resp.data.transactions;
            });
    }

    $scope.getBalance = function () {
		console.log('userService', userService)
        $http.get("/api/accounts/getBalance", { params : { address : userService.address }})
            .then(function (resp) {
                userService.balance = resp.data.balance / 100000000;
                userService.unconfirmedBalance = resp.data.unconfirmedBalance / 100000000;
                userService.secondPassphrase = resp.data.secondPassphrase || false;
                userService.unconfirmedPassphrase = resp.data.unconfirmedPassphrase || false;
                $scope.balance = userService.balance;
                $scope.unconfirmedBalance = userService.unconfirmedBalance;
                $scope.secondPassphrase = userService.secondPassphrase || false;
                $scope.unconfirmedPassphrase = userService.unconfirmedPassphrase || false;
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