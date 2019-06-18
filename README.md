# ground-example
Example ground station controller (for workshop use)

This is a minimal working example of a sattelite tracker which talks the [rotctld protocol](http://hamlib.sourceforge.net/manuals/hamlib.html#rotctld-protocol). It provides means to query status, to list upcoming passes, to track a specific satellite for a single pass, and to stop tracking. It has been tested with both:
- [my (Roland's) WRAPS antenna rotator](https://rolandturner.com/2016/07/06/first-successful-satellite-tracker-test); and
- [ground-simulator](https://github.com/rolandturner/ground-simulator), a simulator created to mimic the performance of the above.

It was created for a [workshop](https://rolandturner.com/jsconf/) at [JSConf.Asia 2019](https://2019.jsconf.asia/) to provide participants with a working example.
