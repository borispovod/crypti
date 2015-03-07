require('angular');

angular.module('webApp').controller('registrationDelegateModalController', ["$scope", "registrationDelegateModal", "$http", "userService", "delegateService",
    function ($scope, registrationDelegateModal, $http, userService, delegateService) {
        $scope.error = null;
        $scope.delegate = userService.delegate;
        $scope.action = false;

        $scope.close = function () {
            if ($scope.destroy) {
                $scope.destroy();
            }

            registrationDelegateModal.deactivate();
        }

        $scope.registrationDelegate = function () {
            $scope.action = true;
            $scope.error = null;

            $http.put("/api/delegates/", {secret: $scope.secretPhrase, username: $scope.username})

                .then(function (resp) {
                    $scope.action = false;
                    userService.setDelegateProcess(resp.data.success);

                    if (resp.data.success) {
                        if ($scope.destroy) {
                            $scope.destroy();
                        }

                        registrationDelegateModal.deactivate();
                    } else {
                        $scope.error = resp.data.error;
                    }
                });
        }

    }]);