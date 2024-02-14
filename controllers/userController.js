const User = require("../models/userModel");
const Post = require("../models/postModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const multer = require("multer");
const sharp = require("sharp");
const sendEmail = require("../utils/email");
const path = require('path');
const fs = require('fs');
const {    cloudinaryUploadImage,
  cloudinaryRemoveImage } = require('../utils/cloudinary');

const DataURIParser = require('datauri/parser');
const duri = new DataURIParser();


// a file is uploaded, Multer will store the file data in memory rather than storing it on disk
const multerStorage = multer.memoryStorage();

// filter to test if the uploaded file is an image
const multerFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image")) {
    cb(null, true);
  } else {
    cb(new AppError("Not an image! Please upload images only.", 400));
  }
};

// midlleware for upload photo
const upload = multer({
  storage: multerStorage,
  fileFilter: multerFilter,
});
exports.uploadUserPhoto = upload.single("photo");

exports.resizeUserPhoto = catchAsync(async (req, res, next) => {
  // 1) validation
  if (!req.file) return next(
    new AppError('No photo provided', 400)
  );

  // 2) get the path to the image
  // const imageName = `user-${req.user.id}-${Date.now()}.jpeg`;
  // console.log(req.file)
  // const imagePath = path.join(__dirname, `../public/img/users/${imageName}`);
  
  const newImagePath = duri.format(path.extname(req.file.originalname).toString(), req.file.buffer)

  // console.log(newImagePath.content);

  // return;
  // console.log(imagePath)
  // 3) upload to  cloudinary 
   const result = await cloudinaryUploadImage(newImagePath.content);
   console.log({result});

   /******************************* */
  //  const secureUrl = result.secure_url;
  //      // Update the user document in the database with the secure_url
  //      const user = await User.findById(req.user.id);
  //      user.photo = secureUrl;
  //      await user.save();
   /*** SAVE IMAGE TO DATABASE ***/

   // 4) get the user from DB 
  //  const user = await User.findById(req.user.id); 
   // 5) delete the old photo if exist
   // 6) change the photo field in the DB
   // 7) send the respones  with status OK and the modified user
   // 8) remove image from the server

next();

//  store photo locally

  // req.file.filename = `user-${req.user.id}-${Date.now()}.jpeg`;

  // // Resize the image using sharp
  // await sharp(req.file.buffer)
  //   .resize(500, 500)
  //   .toFormat("jpeg")
  //   .jpeg({ quality: 90 })
  //   .toFile(`public/img/users/${req.file.filename}`);

  // // Continue to the next middleware after the resizing is complete
  // next();
});


//filter out unwanted fields from the input object and return a new object containing only the allowed fields.
const filterObj = (obj, ...allowedFields) => {
  const newObj = {};
  Object.keys(obj).forEach((el) => {
    if (allowedFields.includes(el)) newObj[el] = obj[el];
  });
  return newObj;
};

exports.updateMe = catchAsync(async (req, res, next) => {
  //1) Create error if user POSTs password data
  if (req.body.password || req.body.passwordConfirm) {
    return next(
      new AppError(
        "This route is not for password updates. Please use /updateMyPassword.",
        400
      )
    );
  }

  if(req.body.email){
    return next(
      new AppError("Email can not be changed.", 400)
    );
  }

  // 2) Filtered out unwanted fields names that are allowed to be updated
  const filteredBody = filterObj(req.body, "name", "photo", "phone");
  // update photo and save it to database
  if (req.file) filteredBody.photo = req.file.filename;
  // 3) Update user document
  const updatedUser = await User.findByIdAndUpdate(req.user.id, filteredBody, {
    new: true,
    runValidators: true,
  });

  res.status(200).json({
    status: "success",
    data: {
      user: updatedUser,
    },
  });
});


// retrieve the ID of the authenticated user from the req.user object and assign it to req.params.id
exports.getMe = (req, res, next) => {
  req.params.id = req.user.id;
  next();
};

exports.getOne = catchAsync(async (req, res, next) => {
  const doc = await User.findById(req.params.id).populate({
    path: 'posts',
    select: '-user'
  });

  if (!doc) return next(new AppError("No user found with that ID", 404));

  res.status(200).json({
    status: "success",
    data: {
      data: doc,
    },
  });
});

exports.updatePassword = catchAsync(async (req, res, next) => {
  //1) get user from collection
  const user = await User.findById(req.user.id).select("+password");
  //2) check if POSTED current password is correct
  if (!(await user.correctPassword(req.body.passwordCurrent, user.password))) {
    return next(new AppError("Your current password is wrong.", 401));
  }
  //3) if so , update password
  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  await user.save();
  //4) log user in , sent jwt
  createSendToken(user, 200, res);
});


exports.deleteMe = catchAsync(async (req, res, next) => {

  const userId = req.user.id;
  //Remove users posts
  await Promise.all([
    User.findByIdAndDelete(userId),
    Post.deleteMany({ user: userId })
  ]);

  // await User.findByIdAndDelete(req.user.id);

  res.status(204).json({
    status: "success",
    data: null,
  });
});


exports.getUserById = catchAsync(async(req, res, next) => {
  // Get user from params
  const id = req.params.id;
  // Check if the user exists
  const user = await User.findById(id).populate({
    path: 'posts',
    select: '-user'
  });
    if (!user) {
      return next(new AppError("No user found with that ID.", 404));
    }
      res.status(200).json({
        status:"succes",
        data: {
          user,
        }
      })
});

exports.getAllUsers = catchAsync(async (req, res) => {
  const users = await User.find();
  // SEND RESPONSE
  res.status(200).json({
    status: "success",
    results: users.length,
    data: {
      users,
    },
  });
});