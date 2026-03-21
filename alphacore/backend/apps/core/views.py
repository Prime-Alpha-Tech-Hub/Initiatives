from rest_framework import serializers, viewsets, permissions
from .models import ActivityLog


class ActivityLogSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()

    class Meta:
        model  = ActivityLog
        fields = '__all__'

    def get_user_name(self, obj):
        return obj.user.get_full_name() if obj.user else 'System'


class ActivityLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset           = ActivityLog.objects.all().select_related('user')
    serializer_class   = ActivityLogSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields   = ['entity', 'entity_id']
    search_fields      = ['action', 'detail']
