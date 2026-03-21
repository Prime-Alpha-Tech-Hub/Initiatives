from django.db import models
from django.contrib.auth.models import User


# UserProfile lives in apps.accounts — not duplicated here.

class ActivityLog(models.Model):
    user       = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    action     = models.CharField(max_length=200)
    entity     = models.CharField(max_length=100, blank=True)
    entity_id  = models.CharField(max_length=100, blank=True)
    detail     = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        ts = self.created_at.strftime("%Y-%m-%d %H:%M") if self.created_at else ""
        return f"{self.user} — {self.action} at {ts}"
