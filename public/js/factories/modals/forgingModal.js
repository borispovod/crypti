require('angular');

angular.module('webApp').factory('forgingModal', function (btfModal) {
    return btfModal({
        controller: 'forgingModalController',
        templateUrl: 'partials/modals/forgingModal.html'
    });
});