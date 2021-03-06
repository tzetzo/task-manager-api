const mongoose = require("mongoose");
const validator = require("validator"); //3rd party validation library
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Task = require("./task");

//create the Schema first so we can use Mongoose middleware(12.3 lesson):
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      unique: true, //there can be only one user with this email
      required: true,
      trim: true,
      lowercase: true,
      validate(value) {
        //3rd party validation
        if (!validator.isEmail(value)) {
          throw new Error("Email is invalid");
        }
      }
    },
    password: {
      type: String,
      required: true,
      minlength: 7,
      trim: true,
      validate(value) {
        if (value.toLowerCase().includes("password")) {
          throw new Error("Password should not contain the word password");
        }
      }
    },
    age: {
      type: Number,
      default: 0, //if age wasnt provided
      validate(value) {
        //custom validation
        if (value < 0) {
          throw new Error("Age must be a positive number");
        }
      }
    },
    tokens: [{ token: { type: String, required: true } }],
    avatar: { type: Buffer } //field to store an image binary data (14.6 lesson)
  },
  { timestamps: true }
);

//virtual field "tasks"; used to get all tasks for the user; not stored in DB; accessed as user.tasks (12.13 lesson)
userSchema.virtual("tasks", {
  ref: "Task",
  localField: "_id",
  foreignField: "owner"
});

//auto remove password, tokens & avatar (binary data) from the response; 12.11 lesson;
//mongoose toJSON() is auto called on the user object every time res.send() is used(JSON.stringify is used)
userSchema.methods.toJSON = function() {
  const user = this;

  const userObject = user.toObject();

  delete userObject.password;
  delete userObject.tokens;
  delete userObject.avatar;

  return userObject;
};

//define custom instance method for JWT creation; cant be arrow function!
//accessed directly through user.generateAuthToken()
//SignUp & SignIn user endpoints use it
userSchema.methods.generateAuthToken = async function() {
  const user = this;
  //create the JWT:
  const token = jwt.sign({ _id: user._id.toString() }, process.env.JWT_SECRET); //{expiresIn: '7 days'} as third parameter
  //add the JWT to the user tokens field
  user.tokens = user.tokens.concat({ token });
  //save the user with the new token to DB:
  await user.save();
  return token;
};

//define custom model method findByCredentials;
//accessed directly through User.findByCredentials()
//SignIn user endpoint uses it
userSchema.statics.findByCredentials = async (email, password) => {
  const user = await User.findOne({ email });
  if (!user) {
    throw new Error("Unable to login"); //provide more general message to user so to not give him too much credentials info
  }
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new Error("Unable to login");
  }
  return user;
};

//Hash the plain text password before saving;
//mongoose middleware; executed each time before 'user.save()' is used(12.3 lesson);
//SignUp user & Update user password endpoints use it
userSchema.pre("save", async function(next) {
  const user = this; //this refers to individual document

  if (user.isModified("password")) {
    //fired when user is created & when password is changed
    user.password = await bcrypt.hash(user.password, 8);
  }

  next();
});

//delete user tasks when user is deleted;
//mongoose middleware; executed each time before 'user.remove()' is used (12.15 lesson)
userSchema.pre("remove", async function(next) {
  const user = this;

  await Task.deleteMany({ owner: user._id });

  next();
});

const User = mongoose.model("User", userSchema);

module.exports = User;
