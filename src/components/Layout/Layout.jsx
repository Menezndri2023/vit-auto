import React from "react";
import Navbar from "../Navbar/Navbar";
import Footer from "../Footer/Footer";
import BackToTop from "./BackToTop";
import styles from "./Layout.module.css";

const Layout = ({ children }) => {
  return (
    <div className={styles.page}>
      <Navbar />
      <main className={styles.main}>{children}</main>
      <Footer />
      <BackToTop />
    </div>
  );
};

export default Layout;
