require('angular');

angular.module('webApp').factory('voteModal', function (btfModal) {
    return btfModal({
        controller: 'voteController',
        templateUrl: 'partials/modals/vote.html'
    });
});