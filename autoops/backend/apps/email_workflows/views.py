from rest_framework import serializers, viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from .models import EmailRule, EmailLog, FollowUpTask
from .tasks import process_inbox


class EmailRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model  = EmailRule
        fields = '__all__'
        read_only_fields = ['match_count', 'created_at']


class EmailLogSerializer(serializers.ModelSerializer):
    class Meta:
        model  = EmailLog
        fields = '__all__'


class FollowUpTaskSerializer(serializers.ModelSerializer):
    class Meta:
        model  = FollowUpTask
        fields = '__all__'
        read_only_fields = ['created_at']


class EmailRuleViewSet(viewsets.ModelViewSet):
    queryset           = EmailRule.objects.all()
    serializer_class   = EmailRuleSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields   = ['is_active', 'action', 'trigger']

    @action(detail=False, methods=['post'])
    def run_inbox(self, request):
        process_inbox.delay()
        return Response({'message': 'Inbox processing started.'})


class EmailLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset           = EmailLog.objects.all()
    serializer_class   = EmailLogSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields   = ['status']
    search_fields      = ['sender', 'subject']


class FollowUpTaskViewSet(viewsets.ModelViewSet):
    queryset           = FollowUpTask.objects.all()
    serializer_class   = FollowUpTaskSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields   = ['status', 'assigned_to']

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        task = self.get_object()
        task.status = 'done'
        task.save(update_fields=['status'])
        return Response(FollowUpTaskSerializer(task).data)
