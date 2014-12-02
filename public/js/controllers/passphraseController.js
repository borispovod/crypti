webApp.controller('passphraseController', ['$scope', '$rootScope', '$http', "$state", "userService",
    function($rootScope, $scope, $http, $state, userService) {
        angular.element(document.getElementById("forgingButton")).show();

        $scope.login = function(pass) {
            var data = {secret: pass};
            if (!pass || pass.length > 100){
            }
            else{
                $http.post("/api/accounts/open/", { secret : pass })
                    .then(function (resp) {
                        if (resp.data.success) {
                            userService.setData(resp.data.account.address, resp.data.account.publickey, resp.data.account.balance, resp.data.account.unconfirmedBalance, resp.data.account.effectiveBalance);
                            userService.setForging(resp.data.account.forging);
                            userService.setSecondPassphrase(resp.data.account.secondPassphrase);
                            userService.unconfirmedPassphrase = resp.data.account.unconfirmedPassphrase;

                            angular.element(document.getElementById("forgingButton")).hide();
                            $state.go('main.account');
                        } else {
                            alert("Something wrong. Restart server please.");
                        }
                    });
            }
        }
}]);