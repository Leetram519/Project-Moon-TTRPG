class LimbType:
    """A dummy class representing different types of limbs."""
    ARM = 0
    LEG = 1

# Mock definitions for demonstration purposes, assuming they existed in the original scope.
class MockLostLimbs:
    def __init__(self):
        # Example structure for lost limbs (list of integers/identifiers)
        self.lost_limbs = {
            LimbType.ARM: [10, 20], # Two arms lost in this example mock setup
            LimbType.LEG: []
        }

class Actor:
    """Mock class representing the 'actor' object."""
    def __init__(self):
        self.lost_limbs = MockLostLimbs().lost_limbs

# Initialize the actor variable, which was missing and causing NameError
actor = Actor() 

# The corrected code block now uses the defined 'actor' variable
arm_status = f"Arms: {2 - len(actor.lost_limbs[LimbType.ARM])} functioning ({', '.join(map(str, actor.lost_limbs[LimbType.ARM])) if actor.lost_limbs[LimbType.ARM] else 'None lost'}).center(30)"

print(arm_status)