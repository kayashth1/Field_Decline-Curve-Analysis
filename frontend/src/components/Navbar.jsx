import React from 'react';
import { Box, Flex, Heading, Spacer, Link, HStack, Text } from '@chakra-ui/react';
import { FaGithub, FaLinkedin } from 'react-icons/fa';

function Navbar() {
  return (
    <Box bg="blue.900" px={6} py={4} boxShadow="md" mb={6}>
      <Flex align="center" color="white">
        <Heading size="md">Decline Curve Analysis</Heading>
        <Spacer />
        <HStack spacing={4}>
          <Text fontWeight="bold" >Yash Shrivastav</Text>
          <Link href="https://github.com/kayashth1" isExternal target='blank'>
            <FaGithub size="20px" color="white" />
          </Link>
          <Link href="https://www.linkedin.com/in/kayashth1/" isExternal target='blank'>
            <FaLinkedin size="20px" color="white" />
          </Link>
        </HStack>
      </Flex>
    </Box>
  );
}

export default Navbar;
