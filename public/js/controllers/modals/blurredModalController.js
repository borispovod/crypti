angular.module('webApp').controller('BlurredModalController', ['$scope', '$rootScope', 'stBlurredDialog', 'peerFactory', '$location',
    function ($scope, $rootScope, stBlurredDialog, peerFactory, $location) {
        // Get the data passed from the controller
        $scope.dialogData = stBlurredDialog.getDialogData();
        $scope.dialogData.retry = false;
        $scope.close = function () {
            $rootScope.$broadcast('edit-peer');
            stBlurredDialog.close();
        };
        $scope.retry = function () {
            $scope.dialogData.retry = true;
            peerFactory.checkPeer(peerFactory.getUrl(), function (resp) {
                $scope.dialogData.retry = false;
                if (resp.status == 200) {
                    $rootScope.$broadcast('start-interval');
                    stBlurredDialog.close();
                }
            })
        };

        $scope.reconfigure = function () {
            $rootScope.$broadcast('edit-peer');
            peerFactory.editing = true;
            $location.path('./index.html');
            stBlurredDialog.close();
        };
    }]);