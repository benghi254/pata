<?php
$Fname = $_POST['fstname'];
$Sname = $_POST['scndname'];
$password= $_POST['pwd'];
$email= $_POST['email'];


if(!empty($Fname)|| !empty($Sname) || !empty($password)){

    $host = "localhost";
    $username = "root";
    $DBpassword = "";
    $dbname ="pata";

    $conn = new mysqli($host, $username, $DBpassword, $dbname);

    if (mysqli_connect_error()){
        die('connect Error('.mysqli_connect_error().')'. mysqli_connect_error());
    }else{
        //$SELECT ="SELECT email FROM registration WHERE email= ? Limit=1";
        //$INSERT ="INSERT INTO registration(email , firstName, secondName, password) VALUES (?,?,?,?)";

        $stmt = $conn->prepare("INSERT INTO registration(email , firstName, secondName, password) VALUES (?,?,?,?)");
        $stmt-> bind_param("ssss",$email,$Fname,$Sname,$password);
        $stmt->execute();
        echo "Registration was succesful";
        $stmt->close();
        $conn->close();
        header ('Location: buy.html');

       
       /* $stmt = $conn->prepare($SELECT);
        $stmt->bind_param("s", $email);
        $stmt-> execute();
        $stmt->bind_result($email);
        $rnum = $stmt->num_rows; 
        if($rnum==0){
            
            $stmt = $conn->prepare($INSERT);
            $stmt->bind_param("sss",$email,$Fname,$Sname,$password);
            $stmt->execute();
            echo "Registration was succesful";
        }else{
            echo "Please choose another Name";
        }*/
    }

}else{
    echo "All fields are required";
    die();
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Document</title>
</head>
<body>
    
</body>
</html>