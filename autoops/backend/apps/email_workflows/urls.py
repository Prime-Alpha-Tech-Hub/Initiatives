from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import EmailRuleViewSet, EmailLogViewSet, FollowUpTaskViewSet

router = DefaultRouter()
router.register('rules', EmailRuleViewSet,   basename='email-rule')
router.register('logs',  EmailLogViewSet,    basename='email-log')
router.register('tasks', FollowUpTaskViewSet,basename='followup-task')
urlpatterns = [path('', include(router.urls))]
