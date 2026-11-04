// Sample OpModes for the code pane. Slide 21 of the workshop deck uses the first two.
export const SLIDE21_WORKING = `package org.firstinspires.ftc.teamcode;

import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;
import com.qualcomm.robotcore.eventloop.opmode.TeleOp;
import com.qualcomm.robotcore.hardware.DcMotor;

@TeleOp(name = "Workshop TeleOp")
public class MyTeleOp extends LinearOpMode {
    @Override
    public void runOpMode() {
        // Hardware mapping. These names come from the robot configuration.
        DcMotor frontLeft = hardwareMap.get(DcMotor.class, "frontLeft");
        DcMotor frontRight = hardwareMap.get(DcMotor.class, "frontRight");
        DcMotor backLeft = hardwareMap.get(DcMotor.class, "backLeft");
        DcMotor backRight = hardwareMap.get(DcMotor.class, "backRight");

        // Left motors are mounted mirrored, so reverse them. Every SDK sample does this.
        frontLeft.setDirection(DcMotor.Direction.REVERSE);
        backLeft.setDirection(DcMotor.Direction.REVERSE);

        telemetry.addData("Status", "Initialized");
        telemetry.update();

        waitForStart();

        while (opModeIsActive()) {
            // Gamepad inputs. Pushing the stick forward gives a negative Y.
            double y = -gamepad1.left_stick_y;
            double x = gamepad1.left_stick_x * 1.1; // Counteract imperfect strafing
            double rx = gamepad1.right_stick_x;

            double denominator = Math.max(Math.abs(y) + Math.abs(x) + Math.abs(rx), 1);

            double flPower = (y + x + rx) / denominator;
            double blPower = (y - x + rx) / denominator;
            double frPower = (y - x - rx) / denominator;
            double brPower = (y + x - rx) / denominator;

            frontLeft.setPower(flPower);
            backLeft.setPower(blPower);
            frontRight.setPower(frPower);
            backRight.setPower(brPower);

            telemetry.addData("Motor FL", flPower);
            telemetry.addData("Motor FR", frPower);
            telemetry.addData("Motor BL", blPower);
            telemetry.addData("Motor BR", brPower);
            telemetry.update();
        }
    }
}
`;

export const SLIDE21_BUGGY = SLIDE21_WORKING
  .replace('@TeleOp(name = "Workshop TeleOp")', '@TeleOp(name = "Workshop TeleOp (debug exercise)")')
  .replace('            double y = -gamepad1.left_stick_y;', '            double y = gamepad1.left_stick_y;');

export const ENCODER_AUTO = `package org.firstinspires.ftc.teamcode;

import com.qualcomm.robotcore.eventloop.opmode.Autonomous;
import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;
import com.qualcomm.robotcore.hardware.DcMotor;
import com.qualcomm.robotcore.hardware.IMU;
import com.qualcomm.robotcore.util.ElapsedTime;
import org.firstinspires.ftc.robotcore.external.navigation.AngleUnit;

@Autonomous(name = "Encoder + IMU auto")
public class EncoderAuto extends LinearOpMode {
    static final double TICKS_PER_REV = 537.7;
    static final double WHEEL_DIAMETER_MM = 96.0;
    static final double TICKS_PER_MM = TICKS_PER_REV / (Math.PI * WHEEL_DIAMETER_MM);

    private DcMotor frontLeft, frontRight, backLeft, backRight, lift, intake;
    private IMU imu;
    private ElapsedTime runtime = new ElapsedTime();

    @Override
    public void runOpMode() {
        frontLeft = hardwareMap.get(DcMotor.class, "frontLeft");
        frontRight = hardwareMap.get(DcMotor.class, "frontRight");
        backLeft = hardwareMap.get(DcMotor.class, "backLeft");
        backRight = hardwareMap.get(DcMotor.class, "backRight");
        lift = hardwareMap.get(DcMotor.class, "lift");
        intake = hardwareMap.get(DcMotor.class, "intake");
        imu = hardwareMap.get(IMU.class, "imu");

        frontLeft.setDirection(DcMotor.Direction.REVERSE);
        backLeft.setDirection(DcMotor.Direction.REVERSE);
        for (DcMotor m : new DcMotor[] { frontLeft, frontRight, backLeft, backRight }) {
            m.setMode(DcMotor.RunMode.STOP_AND_RESET_ENCODER);
            m.setMode(DcMotor.RunMode.RUN_USING_ENCODER);
            m.setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.BRAKE);
        }
        imu.resetYaw();

        telemetry.addData("Status", "Ready");
        telemetry.update();
        waitForStart();
        runtime.reset();

        // Drive forward 1200 mm with the intake running, then turn to face the HIVE (to the right).
        intake.setPower(1.0);
        driveStraight(1200, 0.6);
        intake.setPower(0);
        turnToHeading(-35, 0.5);
        lift.setPower(1.0);
        sleep(1200);
        lift.setPower(0);
        driveStraight(300, 0.4);
        stopDrive();

        while (opModeIsActive()) {
            telemetry.addData("Done in", "%.1f s", runtime.seconds());
            telemetry.addData("Heading", "%.1f", imu.getRobotYawPitchRollAngles().getYaw(AngleUnit.DEGREES));
            telemetry.update();
        }
    }

    void driveStraight(double mm, double power) {
        int target = frontLeft.getCurrentPosition() + (int) (mm * TICKS_PER_MM);
        double startHeading = imu.getRobotYawPitchRollAngles().getYaw(AngleUnit.DEGREES);
        while (opModeIsActive() && frontLeft.getCurrentPosition() < target) {
            double heading = imu.getRobotYawPitchRollAngles().getYaw(AngleUnit.DEGREES);
            double correction = (startHeading - heading) * 0.02;
            frontLeft.setPower(power - correction);
            backLeft.setPower(power - correction);
            frontRight.setPower(power + correction);
            backRight.setPower(power + correction);
            telemetry.addData("Encoder", frontLeft.getCurrentPosition());
            telemetry.addData("Target", target);
            telemetry.update();
        }
        stopDrive();
    }

    void turnToHeading(double targetDeg, double maxPower) {
        while (opModeIsActive()) {
            double heading = imu.getRobotYawPitchRollAngles().getYaw(AngleUnit.DEGREES);
            double error = AngleUnit.normalizeDegrees(targetDeg - heading);
            if (Math.abs(error) < 1.5) break;
            double p = Math.max(-maxPower, Math.min(maxPower, error * 0.03));
            frontLeft.setPower(-p);
            backLeft.setPower(-p);
            frontRight.setPower(p);
            backRight.setPower(p);
            telemetry.addData("Heading", "%.1f  error %.1f", heading, error);
            telemetry.update();
        }
        stopDrive();
    }

    void stopDrive() {
        frontLeft.setPower(0); frontRight.setPower(0); backLeft.setPower(0); backRight.setPower(0);
    }
}
`;

export const SAMPLES: { id: string; label: string; source: string }[] = [
  { id: 'slide21', label: 'Workshop TeleOp (slide 21, working)', source: SLIDE21_WORKING },
  { id: 'slide21bug', label: 'Workshop TeleOp (slide 21, debug exercise)', source: SLIDE21_BUGGY },
  { id: 'encoderauto', label: 'Encoder + IMU autonomous', source: ENCODER_AUTO },
];
