class AllocationError(Exception):
    """Base exception for allocation errors."""


class PhaseError(AllocationError):
    """Raised when action is invalid for current phase."""


class CapacityError(AllocationError):
    """Raised when supervisor capacity is exceeded."""


class PrivilegeError(AllocationError):
    """Raised when student lacks choice privilege."""
